
import os
import hmac
from decimal import Decimal

import jwt
import httpx
import psycopg

from jwt.exceptions import InvalidTokenError

from fastapi import (
    FastAPI,
    HTTPException,
    Depends,
    Header,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb


app = FastAPI(title="Order Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_URL = os.environ["DATABASE_URL"]
USER_SERVICE_URL = os.environ.get(
    "USER_SERVICE_URL",
    "http://user:8000"
)
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"

bearer_scheme = HTTPBearer(auto_error=False)


def get_connection():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


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

    return user_id


def verify_internal_token(token: str | None):
    if token is None or not hmac.compare_digest(token, JWT_SECRET):
        raise HTTPException(
            status_code=403,
            detail="Internal service access denied"
        )


@app.on_event("startup")
def create_tables():
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                items JSONB NOT NULL,
                total NUMERIC(10, 2) NOT NULL,
                status VARCHAR(50) NOT NULL DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)


class OrderItem(BaseModel):
    product_id: int
    name: str
    price: Decimal = Field(gt=0)
    quantity: int = Field(gt=0)


class OrderCreate(BaseModel):
    items: list[OrderItem] = Field(min_length=1)
    total: Decimal = Field(gt=0)


@app.get("/")
def home():
    return {"message": "Order Service is running"}


@app.get("/orders")
def get_orders(user_id: int = Depends(get_current_user)):
    with get_connection() as conn:
        return conn.execute(
            """
            SELECT *
            FROM orders
            WHERE user_id = %s
            ORDER BY id DESC
            """,
            (user_id,)
        ).fetchall()


@app.get("/orders/{order_id}")
def get_order(
    order_id: int,
    user_id: int = Depends(get_current_user)
):
    with get_connection() as conn:
        order = conn.execute(
            """
            SELECT *
            FROM orders
            WHERE id = %s AND user_id = %s
            """,
            (order_id, user_id)
        ).fetchone()

    if order is None:
        raise HTTPException(
            status_code=404,
            detail="Order not found"
        )

    return order


@app.post("/orders", status_code=201)
def create_order(
    order_data: OrderCreate,
    user_id: int = Depends(get_current_user)
):
    try:
        response = httpx.get(
            f"{USER_SERVICE_URL}/users/{user_id}",
            timeout=5
        )
    except httpx.RequestError:
        raise HTTPException(
            status_code=503,
            detail="User Service is unavailable"
        )

    if response.status_code == 404:
        raise HTTPException(status_code=404, detail="User not found")

    if response.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail="Could not verify user"
        )

    calculated_total = sum(
        (
            item.price * item.quantity
            for item in order_data.items
        ),
        Decimal("0")
    )

    if calculated_total != order_data.total:
        raise HTTPException(
            status_code=400,
            detail="Order total does not match item prices"
        )

    items = [
        {
            "product_id": item.product_id,
            "name": item.name,
            "price": float(item.price),
            "quantity": item.quantity
        }
        for item in order_data.items
    ]

    with get_connection() as conn:
        new_order = conn.execute(
            """
            INSERT INTO orders (user_id, items, total, status)
            VALUES (%s, %s, %s, 'pending')
            RETURNING *
            """,
            (user_id, Jsonb(items), order_data.total)
        ).fetchone()

    return {
        "message": "Order created successfully",
        "order": new_order
    }


@app.post("/orders/{order_id}/mark-paid")
def mark_order_paid(
    order_id: int,
    internal_token: str | None = Header(
        default=None,
        alias="X-Internal-Token"
    )
):
    verify_internal_token(internal_token)

    with get_connection() as conn:
        order = conn.execute(
            """
            UPDATE orders
            SET status = 'paid'
            WHERE id = %s AND status = 'pending'
            RETURNING *
            """,
            (order_id,)
        ).fetchone()

        if order is None:
            order = conn.execute(
                "SELECT * FROM orders WHERE id = %s",
                (order_id,)
            ).fetchone()

    if order is None:
        raise HTTPException(
            status_code=404,
            detail="Order not found"
        )

    if order["status"] != "paid":
        raise HTTPException(
            status_code=409,
            detail=(
                "Order cannot be marked as paid. "
                f"Current status: {order['status']}"
            )
        )

    return {
        "message": "Order marked as paid",
        "order": order
    }

