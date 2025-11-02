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
import auth

# --- App Initialization ---
app = FastAPI(title="ProjectHub Backend")

# --- CORS Middleware ---
# Allow requests from your frontend development server
# Replace "http://localhost:xxxx" with the actual origin if different (e.g., frontend served by Python simple server)
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

# --- Run the server (for local development) ---
if __name__ == "__main__":
    import uvicorn
    print("Starting ProjectHub backend server...")
    print(f"Allowed frontend origins: {origins}")
    # Relies on startup event for connection now
    uvicorn.run("main:app", host="127.0.0.1", port=8001, reload=True)
