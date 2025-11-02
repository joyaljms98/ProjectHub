# Authentication Utilities

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from dotenv import load_dotenv
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import ValidationError

from models import TokenData

load_dotenv()

# --- Configuration ---
# Generate a secret key using: openssl rand -hex 32
SECRET_KEY = os.getenv("SECRET_KEY", "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7") # Default for dev, CHANGE THIS IN .env for production!
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 # 1 day expiration

# --- Password Hashing ---
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# A separate, faster context for security answers.
# We will compare them in uppercase to make them case-insensitive.
security_answer_context = CryptContext(schemes=["sha256_crypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plain password against a hashed password."""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Hashes a plain password."""
    return pwd_context.hash(password)

def get_security_answer_hash(answer: str):
    """Hashes the security answer in uppercase."""
    # We use .upper() to ensure the check is case-insensitive
    return security_answer_context.hash(answer.upper())

def verify_security_answer(plain_answer: str, hashed_answer: str):
    """Verifies a plain answer against the hashed answer, case-insensitively."""
    # We also use .upper() on the user's input to match the hash
    return security_answer_context.verify(plain_answer.upper(), hashed_answer)

# --- JWT Token Handling ---
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Creates a JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(token: str) -> Optional[TokenData]:
    """Verifies a JWT token and returns the payload (TokenData)."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        # Validate payload against TokenData model
        token_data = TokenData(**payload)
        # Check expiration manually as jwt.decode might not raise error for expired token in all cases
        if token_data.exp < datetime.now(timezone.utc):
             print("Token expired.")
             return None
        return token_data
    except JWTError as e:
        print(f"JWT Error: {e}")
        return None
    except ValidationError as e:
         print(f"Token payload validation error: {e}")
         return None
    except Exception as e:
         print(f"Unexpected error verifying token: {e}")
         return None


# --- Security Answer Hashing ---
# Use the same context for simplicity, though a different salt could be used in theory
def verify_security_answer(plain_answer: str, hashed_answer: str) -> bool:
    """Verifies a plain security answer against its hash."""
    # Compare in uppercase as answers are stored in uppercase
    return pwd_context.verify(plain_answer.upper(), hashed_answer)

def get_security_answer_hash(answer: str) -> str:
    """Hashes a plain security answer (stores in uppercase)."""
    return pwd_context.hash(answer.upper())
