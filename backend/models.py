# Data Models Update

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Any, List
from datetime import datetime # Use datetime directly
from bson import ObjectId # Import ObjectId

class UserBase(BaseModel):
    fullName: str = Field(..., min_length=3)
    email: EmailStr
    role: str # "Admin", "Teacher", "Student"

class UserCreate(UserBase):
    registrationNumber: Optional[str] = None # Required for Student/Teacher
    password: str = Field(..., min_length=8)
    department: Optional[str] = None # Required for Student/Teacher
    securityQuestion: Optional[str] = None # Required for Student/Teacher
    securityAnswer: Optional[str] = None # Required for Student/Teacher

class UserInDBBase(UserBase):
    # Use Field alias to map MongoDB's _id to Pydantic's id (as str)
    # Make id required as it should always exist in DB/Public models
    id: str = Field(..., alias="_id")
    registrationNumber: Optional[str] = None
    department: Optional[str] = None
    securityQuestion: Optional[str] = None
    createdAt: datetime

    class Config:
        populate_by_name = True # Allows using alias '_id'
        from_attributes = True # Allows creating from ORM models (like dicts from MongoDB)
        # Ensure ObjectIds are encoded as strings when converting to JSON
        arbitrary_types_allowed = True
        json_encoders = {
            ObjectId: str,
            # Ensure datetime objects are also serialized correctly
            datetime: lambda dt: dt.isoformat()
        }
        # Allow arbitrary types like ObjectId during initial validation before aliasing
        arbitrary_types_allowed = True


class UserInDB(UserInDBBase):
    hashedPassword: str
    securityAnswerHash: Optional[str] = None


class UserPublic(UserInDBBase):
    """User model without sensitive info"""
    # Inherits id mapping from UserInDBBase
    pass


class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    # Keep using EmailStr for validation if needed, or str if simpler
    email: Optional[EmailStr] = None
    # Add role here if you need it from the token payload (as added in main.py's create_access_token)
    role: Optional[str] = None
    # Add exp if you need to access it (though verify_token checks it)
    exp: Optional[datetime] = None


class LoginRequest(BaseModel):
    email: EmailStr # Use email for login
    password: str

# Add the missing PasswordResetRequest model if needed later
class PasswordResetRequest(BaseModel):
    email: EmailStr
    securityQuestion: str
    securityAnswer: str
    newPassword: str


# ============================================
# PROJECT-RELATED MODELS
# ============================================

class Milestone(BaseModel):
    """Milestone tracking for projects"""
    name: str
    status: str = "not_started"  # enum: "not_started", "in_progress", "completed"
    order: int  # 1-4 for the 4 fixed milestones


class TeamMember(BaseModel):
    """Team member details within a project"""
    userId: str
    role: Optional[str] = None  # e.g., "Frontend Developer", "Designer"
    isLeader: bool = False
    joinedAt: datetime


class ProjectBase(BaseModel):
    """Base project fields"""
    name: str = Field(..., min_length=3, max_length=200)
    description: str = Field(..., min_length=10, max_length=2000)
    courseCode: Optional[str] = None


class ProjectCreate(ProjectBase):
    """Model for creating a new project"""
    deadline: Optional[datetime] = None


class ProjectInDB(ProjectBase):
    """Complete project model as stored in database"""
    id: str = Field(..., alias="_id")
    ownerId: str
    ownerName: str
    department: str
    status: str = "Planning"  # enum: "Planning", "Active", "Completed", "Inactive"
    teamMembers: List[TeamMember] = []
    guideId: Optional[str] = None
    guideName: Optional[str] = None
    milestones: List[Milestone] = []
    progress: int = 0  # 0-100, auto-calculated
    deadline: Optional[datetime] = None
    createdAt: datetime
    updatedAt: datetime

    class Config:
        populate_by_name = True
        from_attributes = True
        arbitrary_types_allowed = True
        json_encoders = {
            ObjectId: str,
            datetime: lambda dt: dt.isoformat()
        }


class ProjectPublic(ProjectInDB):
    """Public project model (no sensitive fields to hide)"""
    pass


class TeamInvitation(BaseModel):
    """Team invitation document"""
    id: str = Field(..., alias="_id")
    projectId: str
    projectName: str
    inviterId: str
    inviterName: str
    inviteeId: str
    inviteeName: str
    status: str = "pending"  # enum: "pending", "accepted", "declined"
    createdAt: datetime
    respondedAt: Optional[datetime] = None

    class Config:
        populate_by_name = True
        from_attributes = True
        arbitrary_types_allowed = True
        json_encoders = {
            ObjectId: str,
            datetime: lambda dt: dt.isoformat()
        }


class GuideRequest(BaseModel):
    """Guide request document"""
    id: str = Field(..., alias="_id")
    projectId: str
    projectName: str
    teacherId: str
    teacherName: str
    ownerId: str
    ownerName: str
    status: str = "pending"  # enum: "pending", "accepted", "declined"
    declineReason: Optional[str] = None
    createdAt: datetime
    respondedAt: Optional[datetime] = None

    class Config:
        populate_by_name = True
        from_attributes = True
        arbitrary_types_allowed = True
        json_encoders = {
            ObjectId: str,
            datetime: lambda dt: dt.isoformat()
        }


# ============================================
# REQUEST/RESPONSE MODELS
# ============================================

class UpdateProjectRequest(BaseModel):
    """Request to update project details"""
    name: Optional[str] = Field(None, min_length=3, max_length=200)
    description: Optional[str] = Field(None, min_length=10, max_length=2000)
    courseCode: Optional[str] = None
    status: Optional[str] = None  # enum: "Planning", "Active", "Completed", "Inactive"
    deadline: Optional[datetime] = None


class UpdateMilestoneRequest(BaseModel):
    """Request to update milestone status"""
    milestoneOrder: int = Field(..., ge=1, le=4)  # 1-4
    status: str  # enum: "not_started", "in_progress", "completed"


class SendTeamInviteRequest(BaseModel):
    """Request to send team invitation"""
    inviteeEmail: EmailStr


class RespondToInviteRequest(BaseModel):
    """Response to team invitation"""
    accept: bool


class SendGuideRequestRequest(BaseModel):
    """Request to send guide request (teacher to student)"""
    # projectId comes from path parameter, no need here
    pass


class RespondToGuideRequest(BaseModel):
    """Response to guide request (student response)"""
    accept: bool
    declineReason: Optional[str] = None


class UpdateTeamMemberRequest(BaseModel):
    """Request to update team member details"""
    role: Optional[str] = None
    isLeader: Optional[bool] = None


class SetDeadlineRequest(BaseModel):
    """Request to set/update project deadline"""
    deadline: datetime


# ============================================
# PROJECT LINK MODELS
# ============================================

class ProjectLinkBase(BaseModel):
    linkUrl: str = Field(..., max_length=1000)
    linkDescription: str = Field(..., max_length=500)

class LinkCreate(ProjectLinkBase):
    pass

class ProjectLinkPublic(ProjectLinkBase):
    id: str = Field(..., alias="_id")
    projectId: str
    phaseOrder: int
    submittedByUserId: str
    submittedByUserName: str
    submittedAt: datetime

    class Config:
        populate_by_name = True
        from_attributes = True
        arbitrary_types_allowed = True
        json_encoders = {
            ObjectId: str,
            datetime: lambda dt: dt.isoformat()
        }