# Data Models Update

from pydantic import BaseModel, EmailStr, Field
from typing import Optional
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
    id: str = Field(..., alias='_id')
    registrationNumber: Optional[str] = None
    department: Optional[str] = None
    securityQuestion: Optional[str] = None
    createdAt: datetime

    class Config:
        populate_by_name = True # Allows using alias '_id'
        from_attributes = True # Allows creating from ORM models (like dicts from MongoDB)
        # Ensure ObjectIds are encoded as strings when converting to JSON
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


