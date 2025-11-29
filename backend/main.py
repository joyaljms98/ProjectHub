# Signup Endpoint Fix

import datetime # Ensure datetime is imported
from datetime import timedelta, timezone # Import timezone
from fastapi import FastAPI, HTTPException, Depends, status, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from pymongo.errors import DuplicateKeyError
from pymongo.database import Database
from bson import ObjectId
from bson.errors import InvalidId
# Import ValidationError for specific error checking
from pydantic import ValidationError
from typing import Optional, List

import database
import models
from models import LinkCreate, ProjectLinkPublic, ChatMessageCreate, ProjectChatMessage, UpdateNoteRequest
import auth

# --- App Initialization ---
app = FastAPI(title="ProjectHub Backend")

# --- CORS Middleware ---
# Allow requests from your frontend development server
# Replace "http://localhost:xxxx" with the actual origin if different (e..g., frontend served by Python simple server)
# The RAG server runs on 8000, so we assume frontend might be there or another port.
# Using "*" is convenient for local dev but unsafe for production.
origins = ["*"] # Allow all for local dev

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Database Connection Lifecycle (Synchronous) ---
@app.on_event("startup")
def startup_db_client(): # Remove async
    try:
        # No await needed
        database.connect_to_mongo()
        database.create_admin_users()
    except database.ConnectionFailure as e:
        print(f"FATAL: Could not connect to MongoDB on startup. {e}")
    except Exception as e:
         # Use repr(e) to get more details on the exception type and message
         print(f"FATAL: Error during startup admin user creation: {repr(e)}")

@app.on_event("shutdown")
def shutdown_db_client(): # Remove async
    # No await needed
    database.close_mongo_connection()

# --- Dependency (Synchronous) ---
def get_db() -> Database: # Change type hint
    # No async/await needed
    db = database.get_database()
    # get_database now raises ConnectionFailure if not connected
    return db

# --- Authentication Dependency ---
def get_current_user(
    authorization: Optional[str] = Header(None),
    db: Database = Depends(get_db)
) -> dict:
    """Extract and verify JWT token, return current user from database"""
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Extract token from "Bearer <token>" format
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format. Expected: Bearer <token>",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = parts[1]

    # Verify token and extract payload
    token_data = auth.verify_token(token)
    if not token_data or not token_data.email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Fetch user from database
    user = db.users.find_one({"email": token_data.email.lower()})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Convert ObjectId to string for easier handling
    user["_id"] = str(user["_id"])
    return user

# --- API Endpoints ---

@app.get("/")
async def read_root():
    return {"message": "Welcome to ProjectHub Backend"}

# Ensure response_model uses the updated UserPublic
@app.post("/signup", response_model=models.UserPublic, status_code=status.HTTP_201_CREATED)
async def signup_user(user_data: models.UserCreate, db: Database = Depends(get_db)): # Change type hint
    """Registers a new user (Student or Teacher)."""
    # Basic Validation
    if user_data.role not in ["Student", "Teacher"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid role specified. Must be 'Student' or 'Teacher'."
        )
    if user_data.role in ["Student", "Teacher"]:
        if not user_data.registrationNumber:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Registration Number is required for Students and Teachers.")
        if not user_data.department:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Department is required for Students and Teachers.")
        if not user_data.securityQuestion:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Security Question is required.")
        if not user_data.securityAnswer:
             raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Security Answer is required.")

    # Check for existing email (case-insensitive recommended)
    # --- Synchronous DB Calls ---
    existing_user_email = db.users.find_one({"email": user_data.email.lower()})
    if existing_user_email:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, # Use 409 Conflict
            detail="Email already registered."
        )

    # Check for existing registration number (if provided)
    if user_data.registrationNumber:
        existing_user_reg = db.users.find_one({"registrationNumber": user_data.registrationNumber})
        if existing_user_reg:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, # Use 409 Conflict
                detail="Registration number already registered."
            )

    hashed_password = auth.get_password_hash(user_data.password)
    # Use the correct function for security answer hash
    security_answer_hash = auth.get_security_answer_hash(user_data.securityAnswer) if user_data.securityAnswer else None

    # Prepare document for insertion
    user_doc = user_data.model_dump(exclude={"password", "securityAnswer"}) # Use Pydantic's model_dump
    user_doc["email"] = user_doc["email"].lower() # Ensure email is lowercase
    user_doc["hashedPassword"] = hashed_password
    user_doc["securityAnswerHash"] = security_answer_hash
    user_doc["createdAt"] = datetime.datetime.now(timezone.utc) # Use timezone-aware datetime

    try:
        # Insert the user document
        inserted = db.users.insert_one(user_doc)
        inserted_id = inserted.inserted_id

        # --- Fetch the created user ---
        # Crucially, fetch the document *after* insertion to get the _id
        created_user_doc = db.users.find_one({"_id": inserted_id})
        # --- End Synchronous DB Calls ---


        if not created_user_doc:
            print(f"Error: Could not find user immediately after insertion with ID: {inserted_id}")
            raise HTTPException(status_code=500, detail="Failed to retrieve user after creation.")
        
        created_user_doc["_id"] = str(created_user_doc["_id"])

        # Let FastAPI handle the response model validation and conversion
        # Pydantic v2 with the alias should handle the ObjectId -> str conversion for 'id'
        return created_user_doc

    except DuplicateKeyError as e:
        # More specific error message based on index
        field = "email" if "email_" in str(e) else "registration number" if "registrationNumber_" in str(e) else "unique field"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"User with this {field} already exists."
        )
    # Catch Pydantic validation errors specifically during response creation
    # Note: FastAPI might raise ResponseValidationError directly, which gets caught by the generic Exception
    except ValidationError as e:
        print(f"Pydantic Validation Error during signup response creation: {e.errors()}")
        # It's usually better to let FastAPI handle ResponseValidationError,
        # but logging it here helps debugging. Re-raise or raise a generic 500.
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error processing user data after creation."
        )
    except Exception as e:
        print(f"Error during signup: {repr(e)}") # Use repr(e) for more detail
        import traceback
        traceback.print_exc() # Print full traceback for unexpected errors
        # If the original exception was the 409 we already raised, re-raise it
        if isinstance(e, HTTPException) and e.status_code == 409:
            raise e
        # Otherwise, raise a generic 500
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred during signup."
        )

@app.post("/login", response_model=models.Token)
async def login_for_access_token(form_data: models.LoginRequest, db: Database = Depends(get_db)): # Change type hint
    """Authenticates a user and returns a JWT token."""
    # Synchronous DB call
    user = db.users.find_one({"email": form_data.email.lower()})

    if not user or not auth.verify_password(form_data.password, user.get("hashedPassword")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        # Ensure 'sub' (subject) is the email, and include 'role'
        data={"sub": user["email"], "role": user.get("role", "Unknown")},
        expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

# --- Password Reset Endpoint (Example) ---
@app.post("/reset-password")
async def reset_password(request: models.PasswordResetRequest, db: Database = Depends(get_db)): # Change type hint
    # Synchronous DB call
    user = db.users.find_one({"email": request.email.lower()})

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user.get("securityQuestion") != request.securityQuestion:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect security question")

    # Use the correct verification function for security answers
    if not user.get("securityAnswerHash") or not auth.verify_security_answer(request.securityAnswer, user["securityAnswerHash"]):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect security answer")

    # Hash the new password
    new_hashed_password = auth.get_password_hash(request.newPassword)

    # Synchronous DB call
    db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"hashedPassword": new_hashed_password}}
    )

    return {"message": "Password reset successfully"}

@app.get("/users/me", response_model=models.UserPublic)
async def get_current_user_details(current_user: dict = Depends(get_current_user)):
    """
    Gets the details for the currently logged-in user.
    """
    # The get_current_user dependency already fetches the user,
    # so we just need to return it.
    return current_user

@app.put("/users/me/note", response_model=models.UserPublic)
async def update_user_note(
    note_data: models.UpdateNoteRequest,
    current_user: dict = Depends(get_current_user),
    db: Database = Depends(get_db)
):
    """Updates the user's personal sticky note."""
    user_id = ObjectId(current_user["_id"])
    
    db.users.update_one(
        {"_id": user_id},
        {"$set": {"stickyNote": note_data.stickyNote}}
    )
    
    updated_user = db.users.find_one({"_id": user_id})
    updated_user["_id"] = str(updated_user["_id"])
    return updated_user

@app.put("/users/me", response_model=models.UserPublic)
async def update_current_user_details(
    update_data: models.UpdateUserPersonalRequest,
    current_user: dict = Depends(get_current_user),
    db: Database = Depends(get_db)
):
    """Updates the current user's personal information."""
    user_id = ObjectId(current_user["_id"])
    
    # Check for registration number conflict
    if update_data.registrationNumber != current_user.get("registrationNumber"):
        existing_user = db.users.find_one({"registrationNumber": update_data.registrationNumber})
        if existing_user and existing_user["_id"] != user_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This registration number is already taken."
            )
            
    update_doc = {
        "fullName": update_data.fullName,
        "registrationNumber": update_data.registrationNumber,
        "department": update_data.department
    }
    
    db.users.update_one({"_id": user_id}, {"$set": update_doc})
    
    updated_user = db.users.find_one({"_id": user_id})
    updated_user["_id"] = str(updated_user["_id"])
    return updated_user

@app.post("/users/me/change-password")
async def change_password_with_security(
    request: models.ChangePasswordSecurityRequest,
    current_user: dict = Depends(get_current_user),
    db: Database = Depends(get_db)
):
    """Changes the current user's password using their security question."""
    user = current_user # Already fetched
    
    if user.get("securityQuestion") != request.securityQuestion:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect security question")

    if not user.get("securityAnswerHash") or not auth.verify_security_answer(request.securityAnswer, user["securityAnswerHash"]):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect security answer")

    new_hashed_password = auth.get_password_hash(request.newPassword)
    
    db.users.update_one(
        {"_id": ObjectId(user["_id"])},
        {"$set": {"hashedPassword": new_hashed_password, "updatedAt": datetime.datetime.now(timezone.utc)}}
    )
    
    return {"message": "Password changed successfully"}

# Note: A "Change Email" endpoint would require email verification (e.g., sending a token)
# which is complex. For now, we will skip implementing it, as requested by the user.
# We will disable the button in the frontend.

# ============================================
# PROJECT MANAGEMENT ENDPOINTS
# ============================================

@app.post("/projects", response_model=models.ProjectPublic, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_data: models.ProjectCreate,
    current_user: dict = Depends(get_current_user),
    db: Database = Depends(get_db)
):
    """Create a new project (Step 1 of wizard)"""
    # Verify user is Student
    if current_user.get("role") != "Student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can create projects"
        )

    # Initialize 4 fixed milestones
    milestones = [
        {"name": "Abstract Creation", "status": "not_started", "order": 1},
        {"name": "Tables and Design", "status": "not_started", "order": 2},
        {"name": "Project Development", "status": "not_started", "order": 3},
        {"name": "Project Report", "status": "not_started", "order": 4}
    ]

    # Create project document
    project_doc = {
        "name": project_data.name,
        "description": project_data.description,
        "courseCode": project_data.courseCode,
        "ownerId": current_user["_id"],
        "ownerName": current_user.get("fullName", "Unknown"),
        "department": current_user.get("department", "Unknown"),
        "status": "not_started",
        "teamMembers": [],
        "guideId": None,
        "guideName": None,
        "milestones": milestones,
        "progress": 0,
        "deadline": project_data.deadline,
        "createdAt": datetime.datetime.now(timezone.utc),
        "updatedAt": datetime.datetime.now(timezone.utc)
    }

    # Insert into database
    result = db.projects.insert_one(project_doc)
    created_project = db.projects.find_one({"_id": result.inserted_id})
    created_project["_id"] = str(created_project["_id"])

    return created_project


@app.get("/projects", response_model=List[models.ProjectPublic])
async def list_projects(
    status_filter: Optional[str] = Query(None, alias="status"),
    role_filter: Optional[str] = Query(None, alias="role"),
    current_user: dict = Depends(get_current_user),
    db: Database = Depends(get_db)
):
    """List projects for current user"""
    query = {}

    if current_user.get("role") == "Student":
        # Students see projects they own or are members of
        if role_filter == "owner":
            query["ownerId"] = current_user["_id"]
        elif role_filter == "member":
            query["teamMembers.userId"] = current_user["_id"]
        else:
            # Both owner and member
            query["$or"] = [
                {"ownerId": current_user["_id"]},
                {"teamMembers.userId": current_user["_id"]}
            ]
    elif current_user.get("role") == "Teacher":
        # Teachers see projects they guide
        query["guideId"] = current_user["_id"]

    # Apply status filter
    if status_filter:
        query["status"] = status_filter

    projects = list(db.projects.find(query).sort("updatedAt", -1))

    # Convert ObjectIds to strings
    for project in projects:
        project["_id"] = str(project["_id"])

    return projects

@app.get("/projects/unassigned", response_model=List[models.ProjectPublic])
async def get_unassigned_projects(
    department: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
    db: Database = Depends(get_db)
):
    """Get unassigned projects for teacher browsing"""
    # Verify user is Teacher
    if current_user.get("role") != "Teacher":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can browse unassigned projects"
        )

    # Build query
    query = {
        "guideId": None,
        "department": department or current_user.get("department"),
        "status": {"$ne": "Inactive"}
    }

    projects = list(db.projects.find(query).sort("createdAt", -1))

    for project in projects:
        project["_id"] = str(project["_id"])

    return projects

@app.get("/projects/{project_id}", response_model=models.ProjectPublic)
async def get_project(
    project_id: str,
    current_user: dict = Depends(get_current_user),
    db: Database = Depends(get_db)
):
    """Get single project details"""
    # Validate ObjectId
    try:
        project_obj_id = ObjectId(project_id)
    except InvalidId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid project ID format"
        )

    # Find project
    project = db.projects.find_one({"_id": project_obj_id})
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )

    # --- ADD THIS BLOCK TO POPULATE NAMES ---
    if "teamMembers" in project and project["teamMembers"]:
        for member in project["teamMembers"]:
            try:
                user_obj_id = ObjectId(member["userId"])
                user = db.users.find_one({"_id": user_obj_id}, {"fullName": 1})
                if user:
                    member["fullName"] = user.get("fullName", "Unknown User")
                else:
                    member["fullName"] = "Unknown User"
            except InvalidId:
                member["fullName"] = "Invalid User ID"
    # --- END OF BLOCK TO ADD ---

    # Check access permission
    user_id = current_user["_id"]
    is_owner = project.get("ownerId") == user_id
    is_member = any(member.get("userId") == user_id for member in project.get("teamMembers", []))
    is_guide = project.get("guideId") == user_id

    if not (is_owner or is_member or is_guide):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this project"
        )

    project["_id"] = str(project["_id"])
    return project


@app.put("/projects/{project_id}", response_model=models.ProjectPublic)
async def update_project(
    project_id: str,
    update_data: models.UpdateProjectRequest,
    current_user: dict = Depends(get_current_user),
    db: Database = Depends(get_db)
):
    """Update project details"""
    # Validate ObjectId
    try:
        project_obj_id = ObjectId(project_id)
    except InvalidId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid project ID format"
        )

    # Find project
    project = db.projects.find_one({"_id": project_obj_id})
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )

    # Check edit permission (owner or team member)
    user_id = current_user["_id"]
    is_owner = project.get("ownerId") == user_id
    is_member = any(member.get("userId") == user_id for member in project.get("teamMembers", []))

    if not (is_owner or is_member):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to edit this project"
        )

    # Build update document
    update_doc = {}
    if update_data.name is not None:
        update_doc["name"] = update_data.name
    if update_data.description is not None:
        update_doc["description"] = update_data.description
    if update_data.courseCode is not None:
        update_doc["courseCode"] = update_data.courseCode
    if update_data.status is not None:
        update_doc["status"] = update_data.status
    if update_data.deadline is not None:
        update_doc["deadline"] = update_data.deadline

    update_doc["updatedAt"] = datetime.datetime.now(timezone.utc)

    # Update project
    db.projects.update_one({"_id": project_obj_id}, {"$set": update_doc})

    # Fetch updated project
    updated_project = db.projects.find_one({"_id": project_obj_id})
    updated_project["_id"] = str(updated_project["_id"])

    return updated_project


@app.delete("/projects/{project_id}")
async def delete_project(
    project_id: str,
    current_user: dict = Depends(get_current_user),
    db: Database = Depends(get_db)
):
    """Delete project"""
    # Validate ObjectId
    try:
        project_obj_id = ObjectId(project_id)
    except InvalidId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid project ID format"
        )

    # Find project
    project = db.projects.find_one({"_id": project_obj_id})
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )

    # Check delete permission (only owner)
    if project.get("ownerId") != current_user["_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the project owner can delete the project"
        )

    # Delete project and related documents
    db.projects.delete_one({"_id": project_obj_id})
    db.team_invitations.delete_many({"projectId": project_id})
    db.guide_requests.delete_many({"projectId": project_id})

    return {"message": "Project deleted successfully"}


@app.put("/projects/{project_id}/milestones", response_model=models.ProjectPublic)
async def update_milestone(
    project_id: str,
    milestone_data: models.UpdateMilestoneRequest,
    current_user: dict = Depends(get_current_user),
    db: Database = Depends(get_db)
):
    """Update milestone status"""
    # Validate ObjectId
    try:
        project_obj_id = ObjectId(project_id)
    except InvalidId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid project ID format"
        )

    # Find project
    project = db.projects.find_one({"_id": project_obj_id})
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )

    # Check edit permission
    user_id = current_user["_id"]
    is_owner = project.get("ownerId") == user_id
    is_member = any(member.get("userId") == user_id for member in project.get("teamMembers", []))
    is_guide = project.get("guideId") == user_id  # <--- ADD THIS LINE

    if not (is_owner or is_member or is_guide):  # <--- ADD 'or is_guide' HERE
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to edit this project"
        )

    # Check if a Student is trying to mark as 'completed'
    if current_user.get("role") == "Student" and milestone_data.status == "completed":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the project guide can mark a phase as completed."
            )

    # Validate milestone status
    if milestone_data.status not in ["not_started", "in_progress", "completed"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid milestone status"
        )

    # Update milestone in array
    milestones = project.get("milestones", [])
    milestone_found = False
    for milestone in milestones:
        if milestone.get("order") == milestone_data.milestoneOrder:
            milestone["status"] = milestone_data.status
            milestone_found = True
            break

    if not milestone_found:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Milestone with order {milestone_data.milestoneOrder} not found"
        )

    # Recalculate progress
    completed_count = sum(1 for m in milestones if m.get("status") == "completed")
    progress = int((completed_count / len(milestones)) * 100)

    # Update project
    db.projects.update_one(
        {"_id": project_obj_id},
        {
            "$set": {
                "milestones": milestones,
                "progress": progress,
                "updatedAt": datetime.datetime.now(timezone.utc)
            }
        }
    )

    # Fetch updated project
    updated_project = db.projects.find_one({"_id": project_obj_id})
    updated_project["_id"] = str(updated_project["_id"])

    return updated_project


# ============================================
# TEAM INVITATION ENDPOINTS
# ============================================

@app.post("/projects/{project_id}/team/invite", response_model=models.TeamInvitation, status_code=status.HTTP_201_CREATED)
async def send_team_invite(
    project_id: str,
    invite_data: models.SendTeamInviteRequest,
    current_user: dict = Depends(get_current_user),
    db: Database = Depends(get_db)
):
    """Send team invitation to student"""
    # Validate ObjectId
    try:
        project_obj_id = ObjectId(project_id)
    except InvalidId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid project ID format"
        )

    # Find project
    project = db.projects.find_one({"_id": project_obj_id})
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )

    # Check permission (only owner can invite)
    if project.get("ownerId") != current_user["_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the project owner can send invitations"
        )

    # Find invitee
    invitee = db.users.find_one({"email": invite_data.inviteeEmail.lower()})
    if not invitee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found"
        )

    # Verify invitee is Student
    if invitee.get("role") != "Student":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only invite students"
        )

    # Verify same department
    if invitee.get("department") != project.get("department"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only invite students from your department"
        )

    # Check team size (owner + members)
    current_team_size = 1 + len(project.get("teamMembers", []))
    if current_team_size >= 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Team is full (max 4 members)"
        )

    invitee_id = str(invitee["_id"])

    # Check if already in team
    if project.get("ownerId") == invitee_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is already project owner"
        )

    if any(member.get("userId") == invitee_id for member in project.get("teamMembers", [])):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is already team member"
        )

    # Check for existing pending invitation
    existing_invite = db.team_invitations.find_one({
        "projectId": project_id,
        "inviteeId": invitee_id,
        "status": "pending"
    })
    if existing_invite:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invitation already sent"
        )

    # Create invitation
    invitation_doc = {
        "projectId": project_id,
        "projectName": project.get("name", "Unknown"),
        "inviterId": current_user["_id"],
        "inviterName": current_user.get("fullName", "Unknown"),
        "inviteeId": invitee_id,
        "inviteeName": invitee.get("fullName", "Unknown"),
        "status": "pending",
        "createdAt": datetime.datetime.now(timezone.utc),
        "respondedAt": None
    }

    result = db.team_invitations.insert_one(invitation_doc)
    created_invitation = db.team_invitations.find_one({"_id": result.inserted_id})
    created_invitation["_id"] = str(created_invitation["_id"])

    return created_invitation


@app.get("/invitations/team", response_model=List[models.TeamInvitation])
async def get_team_invitations(
    request_type: Optional[str] = Query(None, alias="type"), # <-- ADDED
    status_filter: Optional[str] = Query("pending", alias="status"),
    current_user: dict = Depends(get_current_user),
    db: Database = Depends(get_db)
):
    """Get team invitations (received or sent) for current user"""
    query = {} # <-- CHANGED

    # Determine query based on user role and type
    if request_type == "sent":
        query["inviterId"] = current_user["_id"] # <-- ADDED
    else:
        # Default to "received"
        query["inviteeId"] = current_user["_id"] # <-- MOVED

    if status_filter:
        query["status"] = status_filter

    invitations = list(db.team_invitations.find(query).sort("createdAt", -1))

    for invitation in invitations:
        invitation["_id"] = str(invitation["_id"])

    return invitations


@app.post("/invitations/team/{invitation_id}/respond", response_model=models.TeamInvitation)
async def respond_to_team_invite(
    invitation_id: str,
    response_data: models.RespondToInviteRequest,
    current_user: dict = Depends(get_current_user),
    db: Database = Depends(get_db)
):
    """Accept or decline team invitation"""
    # Validate ObjectId
    try:
        invitation_obj_id = ObjectId(invitation_id)
    except InvalidId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid invitation ID format"
        )

    # Find invitation
    invitation = db.team_invitations.find_one({"_id": invitation_obj_id})
    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found"
        )

    # Verify inviteeId
    if invitation.get("inviteeId") != current_user["_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not your invitation"
        )

    # Verify status is pending
    if invitation.get("status") != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invitation already responded to"
        )

    # Find project
    try:
        project_obj_id = ObjectId(invitation.get("projectId"))
    except InvalidId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid project ID in invitation"
        )

    project = db.projects.find_one({"_id": project_obj_id})
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project no longer exists"
        )

    if response_data.accept:
        # Check team size again
        current_team_size = 1 + len(project.get("teamMembers", []))
        if current_team_size >= 4:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Team is now full"
            )

        # Add user to team
        new_member = {
            "userId": current_user["_id"],
            "role": None,
            "isLeader": False,
            "joinedAt": datetime.datetime.now(timezone.utc)
        }

        db.projects.update_one(
            {"_id": project_obj_id},
            {
                "$push": {"teamMembers": new_member},
                "$set": {"updatedAt": datetime.datetime.now(timezone.utc)}
            }
        )

        # Update invitation status
        db.team_invitations.update_one(
            {"_id": invitation_obj_id},
            {
                "$set": {
                    "status": "accepted",
                    "respondedAt": datetime.datetime.now(timezone.utc)
                }
            }
        )
    else:
        # Decline invitation
        db.team_invitations.update_one(
            {"_id": invitation_obj_id},
            {
                "$set": {
                    "status": "declined",
                    "respondedAt": datetime.datetime.now(timezone.utc)
                }
            }
        )

    # Return updated invitation
    updated_invitation = db.team_invitations.find_one({"_id": invitation_obj_id})
    updated_invitation["_id"] = str(updated_invitation["_id"])

    return updated_invitation


@app.delete("/projects/{project_id}/team/{user_id}")
async def remove_team_member(
    project_id: str,
    user_id: str,
    current_user: dict = Depends(get_current_user),
    db: Database = Depends(get_db)
):
    """Remove team member from project"""
    # Validate ObjectId
    try:
        project_obj_id = ObjectId(project_id)
    except InvalidId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid project ID format"
        )

    # Find project
    project = db.projects.find_one({"_id": project_obj_id})
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )

    # Check permission (only owner)
    if project.get("ownerId") != current_user["_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the project owner can remove team members"
        )

    # Verify user is in team
    team_members = project.get("teamMembers", [])
    member_found = any(member.get("userId") == user_id for member in team_members)

    if not member_found:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not a team member"
        )

    # Remove member
    db.projects.update_one(
        {"_id": project_obj_id},
        {
            "$pull": {"teamMembers": {"userId": user_id}},
            "$set": {"updatedAt": datetime.datetime.now(timezone.utc)}
        }
    )

    # Delete any pending invitations
    db.team_invitations.delete_many({"projectId": project_id, "inviteeId": user_id, "status": "pending"})

    return {"message": "Team member removed successfully"}


@app.put("/projects/{project_id}/team/{user_id}", response_model=models.ProjectPublic)
async def update_team_member(
    project_id: str,
    user_id: str,
    update_data: models.UpdateTeamMemberRequest,
    current_user: dict = Depends(get_current_user),
    db: Database = Depends(get_db)
):
    """Update team member details"""
    # Validate ObjectId
    try:
        project_obj_id = ObjectId(project_id)
    except InvalidId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid project ID format"
        )

    # Find project
    project = db.projects.find_one({"_id": project_obj_id})
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )

    # Check permission (only owner)
    if project.get("ownerId") != current_user["_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the project owner can update team members"
        )

    # Find member
    team_members = project.get("teamMembers", [])
    member_index = None
    for i, member in enumerate(team_members):
        if member.get("userId") == user_id:
            member_index = i
            break

    if member_index is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not a team member"
        )

    # Update member fields
    if update_data.role is not None:
        team_members[member_index]["role"] = update_data.role

    if update_data.isLeader is not None:
        # If setting as leader, remove leader status from others
        if update_data.isLeader:
            for member in team_members:
                member["isLeader"] = False
        team_members[member_index]["isLeader"] = update_data.isLeader

    # Update project
    db.projects.update_one(
        {"_id": project_obj_id},
        {
            "$set": {
                "teamMembers": team_members,
                "updatedAt": datetime.datetime.now(timezone.utc)
            }
        }
    )

    # Return updated project
    updated_project = db.projects.find_one({"_id": project_obj_id})
    updated_project["_id"] = str(updated_project["_id"])

    return updated_project


# ============================================
# GUIDE REQUEST ENDPOINTS
# ============================================


@app.post("/projects/{project_id}/guide/request", response_model=models.GuideRequest, status_code=status.HTTP_201_CREATED)
async def send_guide_request(
    project_id: str,
    request_data: models.SendGuideRequestRequest, # <-- CHANGE THIS
    current_user: dict = Depends(get_current_user),
    db: Database = Depends(get_db)
):
    """Teacher sends request to guide a project"""
    # Verify user is Teacher
    if current_user.get("role") != "Teacher":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can send guide requests"
        )

    # Validate ObjectId
    try:
        project_obj_id = ObjectId(project_id)
    except InvalidId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid project ID format"
        )

    # Find project
    project = db.projects.find_one({"_id": project_obj_id})
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )

    # Verify project doesn't have guide
    if project.get("guideId"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Project already has a guide"
        )

    # Verify same department
    if project.get("department") != current_user.get("department"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Can only guide projects in your department"
        )

    # Check for existing pending request
    existing_request = db.guide_requests.find_one({
        "projectId": project_id,
        "teacherId": current_user["_id"],
        "status": "pending"
    })
    if existing_request:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Request already sent"
        )

    # Create guide request
    request_doc = {
        "projectId": project_id,
        "projectName": project.get("name", "Unknown"),
        "teacherId": current_user["_id"],
        "teacherName": current_user.get("fullName", "Unknown"),
        "ownerId": project.get("ownerId"),
        "ownerName": project.get("ownerName", "Unknown"),
        "status": "pending",
        "declineReason": None,
        "deadline": request_data.deadline, # <-- ADD THIS LINE
        "createdAt": datetime.datetime.now(timezone.utc),
        "respondedAt": None
    }

    result = db.guide_requests.insert_one(request_doc)
    created_request = db.guide_requests.find_one({"_id": result.inserted_id})
    created_request["_id"] = str(created_request["_id"])

    return created_request


@app.get("/requests/guide", response_model=List[models.GuideRequest])
async def get_guide_requests(
    request_type: Optional[str] = Query(None, alias="type"),
    status_filter: Optional[str] = Query(None, alias="status"),
    current_user: dict = Depends(get_current_user),
    db: Database = Depends(get_db)
):
    """Get guide requests (for owner) or sent requests (for teacher)"""
    query = {}

    # Determine query based on user role and type
    if current_user.get("role") == "Student" or request_type == "received":
        query["ownerId"] = current_user["_id"]
        # Default to pending for received requests if no filter
        if not status_filter:
            query["status"] = "pending"
    elif current_user.get("role") == "Teacher" or request_type == "sent":
        query["teacherId"] = current_user["_id"]

    # Apply status filter if provided
    if status_filter and "status" not in query:
        query["status"] = status_filter

    requests = list(db.guide_requests.find(query).sort("createdAt", -1))

    for request in requests:
        request["_id"] = str(request["_id"])

    return requests


@app.post("/requests/guide/{request_id}/respond", response_model=models.GuideRequest)
async def respond_to_guide_request(
    request_id: str,
    response_data: models.RespondToGuideRequest,
    current_user: dict = Depends(get_current_user),
    db: Database = Depends(get_db)
):
    """Project owner responds to guide request"""
    # Validate ObjectId
    try:
        request_obj_id = ObjectId(request_id)
    except InvalidId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid request ID format"
        )

    # Find request
    guide_request = db.guide_requests.find_one({"_id": request_obj_id})
    if not guide_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Guide request not found"
        )

    # Verify ownerId
    if guide_request.get("ownerId") != current_user["_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not your project"
        )

    # Verify status is pending
    if guide_request.get("status") != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Request already responded to"
        )

    if not response_data.accept:
        # Decline request
        if not response_data.declineReason or response_data.declineReason.strip() == "":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Decline reason is required"
            )

        db.guide_requests.update_one(
            {"_id": request_obj_id},
            {
                "$set": {
                    "status": "declined",
                    "declineReason": response_data.declineReason,
                    "respondedAt": datetime.datetime.now(timezone.utc)
                }
            }
        )
    else:
        # Accept request
        # Find project
        try:
            project_obj_id = ObjectId(guide_request.get("projectId"))
        except InvalidId:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid project ID in request"
            )

        project = db.projects.find_one({"_id": project_obj_id})
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project no longer exists"
            )

        # Verify project doesn't have guide
        if project.get("guideId"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Project already has a guide"
            )

        # Find teacher
        try:
            teacher_obj_id = ObjectId(guide_request.get("teacherId"))
        except InvalidId:
            teacher_obj_id = None

        teacher = None
        if teacher_obj_id:
            teacher = db.users.find_one({"_id": teacher_obj_id})

        # Update project with guide
        db.projects.update_one(
            {"_id": project_obj_id},
            {
                "$set": {
                    "guideId": guide_request.get("teacherId"),
                    "guideName": teacher.get("fullName", "Unknown") if teacher else "Unknown",
                    "deadline": guide_request.get("deadline"),
                    "status": "in_progress", # <-- 1. SET PROJECT STATUS
                    "milestones.$[elem].status": "in_progress", # <-- 2. SET MILESTONE STATUS
                    "updatedAt": datetime.datetime.now(timezone.utc)
                }
            },
            # This filter applies the update only to milestones where status is "not_started"
            array_filters=[{"elem.status": "not_started"}] # <-- 3. ARRAY FILTER
        )

        # Update this request as accepted
        db.guide_requests.update_one(
            {"_id": request_obj_id},
            {
                "$set": {
                    "status": "accepted",
                    "respondedAt": datetime.datetime.now(timezone.utc)
                }
            }
        )

        # Decline all other pending requests for this project
        db.guide_requests.update_many(
            {
                "projectId": guide_request.get("projectId"),
                "status": "pending",
                "_id": {"$ne": request_obj_id}
            },
            {
                "$set": {
                    "status": "declined",
                    "declineReason": "Another guide was accepted",
                    "respondedAt": datetime.datetime.now(timezone.utc)
                }
            }
        )

    # Return updated request
    updated_request = db.guide_requests.find_one({"_id": request_obj_id})
    updated_request["_id"] = str(updated_request["_id"])

    return updated_request


@app.put("/projects/{project_id}/deadline", response_model=models.ProjectPublic)
async def set_deadline(
    project_id: str,
    deadline_data: models.SetDeadlineRequest,
    current_user: dict = Depends(get_current_user),
    db: Database = Depends(get_db)
):
    """Guide sets/updates project deadline"""
    # Validate ObjectId
    try:
        project_obj_id = ObjectId(project_id)
    except InvalidId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid project ID format"
        )

    # Find project
    project = db.projects.find_one({"_id": project_obj_id})
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )

    # Verify user is project guide
    if project.get("guideId") != current_user["_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the project guide can set deadline"
        )

    # Update deadline
    db.projects.update_one(
        {"_id": project_obj_id},
        {
            "$set": {
                "deadline": deadline_data.deadline,
                "updatedAt": datetime.datetime.now(timezone.utc)
            }
        }
    )

    # Return updated project
    updated_project = db.projects.find_one({"_id": project_obj_id})
    updated_project["_id"] = str(updated_project["_id"])

    return updated_project


# ============================================
# PROJECT PHASE & LINK ENDPOINTS (NEW)
# ============================================

@app.post("/projects/{project_id}/phases/{phase_order}/links", response_model=models.ProjectLinkPublic, status_code=status.HTTP_201_CREATED)
async def submit_project_link(
    project_id: str,
    phase_order: int,
    link_data: models.LinkCreate,
    current_user: dict = Depends(get_current_user),
    db: Database = Depends(get_db)
):
    """Student submits a new link for a project phase."""
    try:
        project_obj_id = ObjectId(project_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    project = db.projects.find_one({"_id": project_obj_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Check permission (owner or team member)
    user_id = current_user["_id"]
    is_owner = project.get("ownerId") == user_id
    is_member = any(member.get("userId") == user_id for member in project.get("teamMembers", []))

    if not (is_owner or is_member):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this project"
        )
    
    if not (1 <= phase_order <= 4):
         raise HTTPException(status_code=400, detail="Phase order must be between 1 and 4")

    # Create link document
    link_doc = {
        "projectId": project_id,
        "phaseOrder": phase_order,
        "linkUrl": link_data.linkUrl,
        "linkDescription": link_data.linkDescription,
        "submittedByUserId": user_id,
        "submittedByUserName": current_user.get("fullName", "Unknown"),
        "submittedAt": datetime.datetime.now(timezone.utc)
    }
    
    result = db.project_links.insert_one(link_doc)
    created_link = db.project_links.find_one({"_id": result.inserted_id})
    created_link["_id"] = str(created_link["_id"])

    return created_link

@app.get("/projects/{project_id}/phases/{phase_order}/links", response_model=List[models.ProjectLinkPublic])
async def get_project_links(
    project_id: str,
    phase_order: int,
    current_user: dict = Depends(get_current_user),
    db: Database = Depends(get_db)
):
    """Gets all submitted links for a project phase."""
    try:
        project_obj_id = ObjectId(project_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    project = db.projects.find_one({"_id": project_obj_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Check access permission (owner, member, or guide)
    user_id = current_user["_id"]
    is_owner = project.get("ownerId") == user_id
    is_member = any(member.get("userId") == user_id for member in project.get("teamMembers", []))
    is_guide = project.get("guideId") == user_id

    if not (is_owner or is_member or is_guide):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this project"
        )

    if not (1 <= phase_order <= 4):
         raise HTTPException(status_code=400, detail="Phase order must be between 1 and 4")

    links = list(db.project_links.find({
        "projectId": project_id,
        "phaseOrder": phase_order
    }).sort("submittedAt", 1))

    for link in links:
        link["_id"] = str(link["_id"])
        
    return links


# ============================================
# PROJECT CHAT ENDPOINTS (NEW)
# ============================================

@app.get("/projects/{project_id}/phases/{phase_order}/chat", response_model=List[models.ProjectChatMessage])
async def get_project_chat_messages(
    project_id: str,
    phase_order: int,
    current_user: dict = Depends(get_current_user),
    db: Database = Depends(get_db)
):
    """Gets all chat messages for a specific project phase."""
    # We can reuse the get_project_links permission logic
    project = await get_project_links_permission_check(project_id, phase_order, current_user, db)

    messages = list(db.project_chat_messages.find({
        "projectId": project_id,
        "phaseOrder": phase_order
    }).sort("sentAt", 1).limit(200)) # Get last 200 messages

    for msg in messages:
        msg["_id"] = str(msg["_id"])
        
    return messages

@app.post("/projects/{project_id}/phases/{phase_order}/chat", response_model=models.ProjectChatMessage, status_code=status.HTTP_201_CREATED)
async def post_project_chat_message(
    project_id: str,
    phase_order: int,
    chat_data: models.ChatMessageCreate,
    current_user: dict = Depends(get_current_user),
    db: Database = Depends(get_db)
):
    """Posts a new chat message to a project phase."""
    project = await get_project_links_permission_check(project_id, phase_order, current_user, db)
    
    message_doc = {
        "projectId": project_id,
        "phaseOrder": phase_order,
        "senderId": current_user["_id"],
        "senderName": current_user.get("fullName", "Unknown"),
        "senderRole": current_user.get("role", "User"),
        "messageText": chat_data.messageText,
        "sentAt": datetime.datetime.now(timezone.utc)
    }
    
    result = db.project_chat_messages.insert_one(message_doc)
    created_message = db.project_chat_messages.find_one({"_id": result.inserted_id})
    created_message["_id"] = str(created_message["_id"])

    return created_message

# We need to create a helper function to avoid duplicating code
async def get_project_links_permission_check(project_id, phase_order, current_user, db):
    try:
        project_obj_id = ObjectId(project_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    project = db.projects.find_one({"_id": project_obj_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    user_id = current_user["_id"]
    is_owner = project.get("ownerId") == user_id
    is_member = any(member.get("userId") == user_id for member in project.get("teamMembers", []))
    is_guide = project.get("guideId") == user_id

    if not (is_owner or is_member or is_guide):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this project's data"
        )
    
    if not (1 <= phase_order <= 4):
         raise HTTPException(status_code=400, detail="Phase order must be between 1 and 4")
    
    return project

# --- THIS FUNCTION NEEDS TO BE MODIFIED ---
@app.get("/projects/{project_id}/phases/{phase_order}/links", response_model=List[models.ProjectLinkPublic])
async def get_project_links(
    project_id: str,
    phase_order: int,
    current_user: dict = Depends(get_current_user),
    db: Database = Depends(get_db)
):
    """Gets all submitted links for a project phase."""
    # All logic is now in the helper function
    await get_project_links_permission_check(project_id, phase_order, current_user, db)

    links = list(db.project_links.find({
        "projectId": project_id,
        "phaseOrder": phase_order
    }).sort("submittedAt", 1))

    for link in links:
        link["_id"] = str(link["_id"])
        
    return links

    
# ============================================
# STUDENT SEARCH ENDPOINT
# ============================================

@app.get("/students/search")
async def search_students(
    q: str = Query(..., min_length=1),
    department: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
    db: Database = Depends(get_db)
):
    """Search for students in same department"""
    # Verify user is Student
    if current_user.get("role") != "Student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can search for team members"
        )

    # Build query
    search_dept = department or current_user.get("department")

    query = {
        "role": "Student",
        "department": search_dept,
        "$or": [
            {"fullName": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}}
        ],
        "_id": {"$ne": ObjectId(current_user["_id"])}  # Exclude current user
    }

    # Find students, limit to 10
    students = list(db.users.find(
        query,
        {"_id": 1, "fullName": 1, "email": 1, "registrationNumber": 1, "department": 1}
    ).limit(10))

    # Convert ObjectIds to strings
    for student in students:
        student["id"] = str(student["_id"])
        del student["_id"]

    return students

@app.get("/students/department", response_model=List[models.UserPublic])
async def get_students_in_department(
    current_user: dict = Depends(get_current_user),
    db: Database = Depends(get_db)
):
    """
    Gets all students in the teacher's department.
    """
    if current_user.get("role") != "Teacher":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can view the department student list"
        )
    
    department = current_user.get("department")
    if not department:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Teacher has no department assigned"
        )

    students = list(db.users.find({
        "role": "Student",
        "department": department
    }))
    
    # Convert ObjectIds
    for student in students:
        student["_id"] = str(student["_id"])
        
    return students

    
# ============================================
# ADMIN ENDPOINTS
# ============================================

from pydantic import BaseModel, Field, EmailStr

class AdminStats(BaseModel):
    """Data model for the admin dashboard stats card"""
    total_projects: int
    total_students: int
    total_teachers: int
    projects_completed: int
    projects_in_progress: int
    projects_planning: int
    active_students: int # A simple count for now
    active_teachers: int # A simple count for now
    guides_count: int
    
def get_current_admin_user(current_user: dict = Depends(get_current_user)):
    """Dependency to check if the current user is an Admin."""
    if current_user.get("role") != "Admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Requires admin privileges"
        )
    return current_user

@app.get("/api/admin/stats", response_model=AdminStats)
async def get_admin_statistics(
    db: Database = Depends(get_db),
    admin_user: dict = Depends(get_current_admin_user)
):
    """Fetches aggregated statistics for the admin dashboard."""
    
    # Project counts
    total_projects = db.projects.count_documents({})
    projects_completed = db.projects.count_documents({"status": "Completed"})
    projects_in_progress = db.projects.count_documents({"status": "Active"}) # Assuming Active = In-Progress
    projects_planning = db.projects.count_documents({"status": "Planning"})
    
    # User counts
    total_students = db.users.count_documents({"role": "Student"})
    total_teachers = db.users.count_documents({"role": "Teacher"})
    
    # Get all teacher IDs
    teacher_ids = [str(user["_id"]) for user in db.users.find({"role": "Teacher"}, {"_id": 1})]
    
    # Find how many unique teachers are listed as guides
    guides_count = len(db.projects.distinct("guideId", {"guideId": {"$in": teacher_ids}}))

    # Note: "Active" user logic is not defined, so we'll just return totals for now
    # You could add a "last_login" field to your user model to calculate this properly
    
    return {
        "total_projects": total_projects,
        "total_students": total_students,
        "total_teachers": total_teachers,
        "projects_completed": projects_completed,
        "projects_in_progress": projects_in_progress,
        "projects_planning": projects_planning,
        "active_students": total_students, # Placeholder
        "active_teachers": total_teachers, # Placeholder
        "guides_count": guides_count
    }

@app.get("/api/admin/users", response_model=List[models.UserPublic])
async def get_all_users(
    role: Optional[str] = Query(None, description="Filter by role (Student or Teacher)"),
    db: Database = Depends(get_db),
    admin_user: dict = Depends(get_current_admin_user)
):
    """Fetches all users, optionally filtered by role."""
    query = {}
    if role in ["Student", "Teacher"]:
        query["role"] = role
    else:
        # By default, don't return Admins in this list
        query["role"] = {"$in": ["Student", "Teacher"]}

    users = list(db.users.find(query))
    for user in users:
        user["_id"] = str(user["_id"])
    return users

@app.get("/api/admin/projects", response_model=List[models.ProjectPublic])
async def get_all_projects(
    db: Database = Depends(get_db),
    admin_user: dict = Depends(get_current_admin_user)
):
    """Fetches all projects in the database."""
    projects = list(db.projects.find({}))
    for project in projects:
        project["_id"] = str(project["_id"])
    return projects

@app.delete("/api/admin/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: str,
    db: Database = Depends(get_db),
    admin_user: dict = Depends(get_current_admin_user)
):
    """Admin-only: Deletes a user by their ID."""
    try:
        user_obj_id = ObjectId(user_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid user ID format")

    # TODO: Add logic here to handle cascading deletes
    # e.g., what happens to projects owned by this user?
    # For now, we just delete the user.
    
    result = db.users.delete_one({"_id": user_obj_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": "User deleted successfully"} # Note: 204 response won't send a body

@app.delete("/api/admin/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project_admin(
    project_id: str,
    db: Database = Depends(get_db),
    admin_user: dict = Depends(get_current_admin_user)
):
    """Admin-only: Deletes a project and its related invitations/requests."""
    try:
        project_obj_id = ObjectId(project_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    result = db.projects.delete_one({"_id": project_obj_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")

    # Clean up related documents
    db.team_invitations.delete_many({"projectId": project_id})
    db.guide_requests.delete_many({"projectId": project_id})
    
    return {"message": "Project deleted successfully"} # Note: 204 response won't send a body

class AdminUserUpdate(BaseModel):
    """Admin-only: Model for updating any user details."""
    fullName: Optional[str] = Field(None, min_length=1)
    email: Optional[EmailStr] = None
    registrationNumber: Optional[str] = None
    department: Optional[str] = Field(None, min_length=1)
    # We explicitly exclude password and security questions for safety

class AdminProjectUpdate(BaseModel):
    """Admin-only: Model for updating any project details."""
    name: Optional[str] = Field(None, min_length=1)
    ownerName: Optional[str] = Field(None, min_length=1) # In case of owner name change
    guideName: Optional[str] = Field(None) # Allow setting to null
    status: Optional[str] = Field(None, min_length=1)
    
# --- ADD THESE NEW PUT ENDPOINTS ---
@app.put("/api/admin/users/{user_id}", response_model=models.UserPublic)
async def update_user_details(
    user_id: str,
    update_data: AdminUserUpdate,
    db: Database = Depends(get_db),
    admin_user: dict = Depends(get_current_admin_user)
):
    """Admin-only: Updates a user's details."""
    try:
        user_obj_id = ObjectId(user_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid user ID format")

    # Create update doc, removing any 'None' values so Mongo doesn't overwrite
    # existing fields with 'null' if they weren't provided.
    update_doc = update_data.model_dump(exclude_unset=True)

    if not update_doc:
        raise HTTPException(status_code=400, detail="No update data provided")
        
    # Special handling for email to keep it lowercase
    if "email" in update_doc:
        update_doc["email"] = update_doc["email"].lower()

    update_result = db.users.update_one(
        {"_id": user_obj_id},
        {"$set": update_doc}
    )
    
    if update_result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
        
    updated_user = db.users.find_one({"_id": user_obj_id})
    updated_user["_id"] = str(updated_user["_id"])
    return updated_user


@app.put("/api/admin/projects/{project_id}", response_model=models.ProjectPublic)
async def update_project_details(
    project_id: str,
    update_data: AdminProjectUpdate,
    db: Database = Depends(get_db),
    admin_user: dict = Depends(get_current_admin_user)
):
    """Admin-only: Updates a project's details."""
    try:
        project_obj_id = ObjectId(project_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    update_doc = update_data.model_dump(exclude_unset=True)

    if not update_doc:
        raise HTTPException(status_code=400, detail="No update data provided")

    update_result = db.projects.update_one(
        {"_id": project_obj_id},
        {"$set": update_doc}
    )

    if update_result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")

    updated_project = db.projects.find_one({"_id": project_obj_id})
    updated_project["_id"] = str(updated_project["_id"])
    return updated_project

# --- Run the server (for local development) ---
if __name__ == "__main__":
    import uvicorn
    print("Starting ProjectHub backend server...")
    print(f"Allowed frontend origins: {origins}")
    # Relies on startup event for connection now
    uvicorn.run("main:app", host="127.0.0.1", port=8001, reload=True)