import os
from datetime import datetime, timedelta
from typing import Optional, Any, Union, Dict
from jose import jwt, JWTError
from passlib.context import CryptContext
from pydantic import BaseModel
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

# Default JWT configuration fallback (override via environment variables)
DEFAULT_SECRET_KEY = os.getenv("SECRET_KEY", "mirage_super_secret_jwt_key_dev_mode_only_2026")
DEFAULT_ALGORITHM = os.getenv("ALGORITHM", "HS256")
DEFAULT_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


class UserClaims(BaseModel):
    id: str
    email: Optional[str] = None
    name: Optional[str] = None


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify plain password against hashed password."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt."""
    return pwd_context.hash(password)


def create_access_token(
    subject: Union[str, Any],
    email: Optional[str] = None,
    name: Optional[str] = None,
    expires_delta: Optional[timedelta] = None,
    secret_key: Optional[str] = None,
    algorithm: Optional[str] = None
) -> str:
    """Generate signed JWT token containing subject user ID and optional profile claims."""
    key = secret_key or DEFAULT_SECRET_KEY
    algo = algorithm or DEFAULT_ALGORITHM

    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=DEFAULT_EXPIRE_MINUTES)

    to_encode: Dict[str, Any] = {
        "exp": expire,
        "sub": str(subject)
    }
    if email:
        to_encode["email"] = email
    if name:
        to_encode["name"] = name

    return jwt.encode(to_encode, key, algorithm=algo)


def decode_access_token(
    token: str,
    secret_key: Optional[str] = None,
    algorithm: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Decode and validate a JWT access token."""
    key = secret_key or DEFAULT_SECRET_KEY
    algo = algorithm or DEFAULT_ALGORITHM

    try:
        payload = jwt.decode(token, key, algorithms=[algo])
        return payload
    except JWTError:
        return None


def get_current_user_claims(
    token: Optional[str] = Depends(oauth2_scheme)
) -> UserClaims:
    """FastAPI dependency to extract and validate authenticated user claims from Authorization header."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials or token expired",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception

    payload = decode_access_token(token)
    if not payload:
        raise credentials_exception

    user_id = payload.get("sub")
    if not user_id:
        raise credentials_exception

    return UserClaims(
        id=user_id,
        email=payload.get("email"),
        name=payload.get("name")
    )


def get_optional_user_claims(
    token: Optional[str] = Depends(oauth2_scheme)
) -> Optional[UserClaims]:
    """FastAPI dependency to optionally extract user claims if token is present."""
    if not token:
        return None
    payload = decode_access_token(token)
    if not payload:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    return UserClaims(
        id=user_id,
        email=payload.get("email"),
        name=payload.get("name")
    )

