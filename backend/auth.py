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
    # FIX: Encode plain_password to bytes
    return pwd_context.verify(plain_password.encode('utf-8'), hashed_password)

def get_password_hash(password: str) -> str:
    """Hashes a plain password."""
    # FIX: Encode password to bytes
    return pwd_context.hash(password.encode('utf-8'))

def get_security_answer_hash(answer: str):
    """Hashes the security answer in uppercase."""
    # We use .upper() to ensure the check is case-insensitive
    # FIX: Encode answer to bytes
    return security_answer_context.hash(answer.upper().encode('utf-8'))

def verify_security_answer(plain_answer: str, hashed_answer: str):
    """Verifies a plain answer against the hashed answer, case-insensitively."""
    # We also use .upper() on the user's input to match the hash
    # FIX: Encode plain_answer to bytes
    return security_answer_context.verify(plain_answer.upper().encode('utf-8'), hashed_answer)

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
        # jwt.decode will automatically check expiration and raise JWTError if expired
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        # Extract email from 'sub' claim (standard JWT claim for subject)
        email = payload.get("sub")
        if not email:
            print("Token missing 'sub' claim")
            return None

        # Extract role
        role = payload.get("role")

        # Create TokenData with extracted values
        token_data = TokenData(email=email, role=role)
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