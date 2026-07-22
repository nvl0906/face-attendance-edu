import os
import jwt
from typing import Annotated
from pydantic import BaseModel
from fastapi import Request, HTTPException, status, Depends
from fastapi.security import OAuth2PasswordBearer
from supabase import AsyncClient
from insightface.app import FaceAnalysis

# --- Models ---
class User(BaseModel):
    userid: str
    username: str
    fullname: str
    is_institution: bool

# --- Configuration ---
JWT_SECRET = os.getenv("FAE_JWT_SECRET")
JWT_ALGORITHM = os.getenv("FAE_JWT_ALGORITHM", "HS256")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

# --- Authentication Logic ---
async def create_access_token(data: dict):
    # Standard practice: encode with the shared secret
    return jwt.encode(data, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(token: Annotated[str, Depends(oauth2_scheme)]) -> User:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        # Validate data matches our User model automatically
        return User(**payload)
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="Could not validate credentials"
        )

async def verify_token(token: str):
    """Decode JWT token and raise if invalid"""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        return None

# --- Resource Dependencies (Keep as def for speed) ---
async def get_supabase(request: Request) -> AsyncClient:
    return request.app.state.supabase

def get_face_app(request: Request) -> FaceAnalysis:
    return request.app.state.face_app
