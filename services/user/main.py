
import os
from datetime import datetime, timedelta, timezone

import jwt
import psycopg

from pwdlib import PasswordHash
from jwt.exceptions import InvalidTokenError

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field
from psycopg.rows import dict_row


app = FastAPI(title="User Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_URL = os.environ["DATABASE_URL"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

password_hash = PasswordHash.recommended()
bearer_scheme = HTTPBearer(auto_error=False)


def get_connection():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def create_access_token(user_id: int):
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "sub": str(user_id),
        "exp": expire,
    }

    return jwt.encode(
        payload,
        JWT_SECRET,
        algorithm=JWT_ALGORITHM
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)
):
    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(
            credentials.credentials,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM]
        )

        user_id = int(payload["sub"])

    except (InvalidTokenError, KeyError, ValueError, TypeError):
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    with get_connection() as conn:
        user = conn.execute(
            """
            SELECT id, name, email
            FROM users
            WHERE id = %s
            """,
            (user_id,)
        ).fetchone()

    if user is None:
        raise HTTPException(status_code=401, detail="User not found")

    return user


@app.on_event("startup")
def create_tables():
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL
            )
        """)

        conn.execute("""
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS password_hash TEXT
        """)

        conn.execute("""
            INSERT INTO users (name, email)
            VALUES
                ('Ahmed', 'ahmed@example.com'),
                ('Mohamed', 'mohamed@example.com'),
                ('Ali', 'ali@example.com')
            ON CONFLICT (email) DO NOTHING
        """)


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


@app.get("/")
def home():
    return {"message": "User Service is running"}


@app.get("/users")
def get_users():
    with get_connection() as conn:
        return conn.execute(
            """
            SELECT id, name, email
            FROM users
            ORDER BY id
            """
        ).fetchall()


@app.get("/users/{user_id}")
def get_user(user_id: int):
    with get_connection() as conn:
        user = conn.execute(
            """
            SELECT id, name, email
            FROM users
            WHERE id = %s
            """,
            (user_id,)
        ).fetchone()

    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    return user


@app.post("/auth/register", status_code=201)
def register(user_data: RegisterRequest):
    hashed_password = password_hash.hash(user_data.password)

    try:
        with get_connection() as conn:
            user = conn.execute(
                """
                INSERT INTO users (name, email, password_hash)
                VALUES (%s, %s, %s)
                RETURNING id, name, email
                """,
                (
                    user_data.name.strip(),
                    str(user_data.email).lower(),
                    hashed_password,
                )
            ).fetchone()

    except psycopg.errors.UniqueViolation:
        raise HTTPException(
            status_code=409,
            detail="Email already exists"
        )

    token = create_access_token(user["id"])

    return {
        "message": "Registration successful",
        "access_token": token,
        "token_type": "bearer",
        "user": user,
    }


@app.post("/auth/login")
def login(login_data: LoginRequest):
    with get_connection() as conn:
        user = conn.execute(
            """
            SELECT id, name, email, password_hash
            FROM users
            WHERE email = %s
            """,
            (str(login_data.email).lower(),)
        ).fetchone()

    if (
        user is None
        or user["password_hash"] is None
        or not password_hash.verify(
            login_data.password,
            user["password_hash"]
        )
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    token = create_access_token(user["id"])

    return {
        "message": "Login successful",
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
        },
    }


@app.get("/auth/me")
def get_me(current_user=Depends(get_current_user)):
    return current_user

