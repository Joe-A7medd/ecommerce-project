
import os
from decimal import Decimal

import httpx
import psycopg

from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from psycopg.rows import dict_row

app = FastAPI(title="Payment Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_URL = os.environ["DATABASE_URL"]
ORDER_SERVICE_URL = os.environ.get(
    "ORDER_SERVICE_URL",
    "http://order:8000"
)
JWT_SECRET = os.environ["JWT_SECRET"]


def get_connection():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


@app.on_event("startup")
def create_tables():
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS payments (
                id SERIAL PRIMARY KEY,
                order_id INTEGER NOT NULL,
                amount NUMERIC(10, 2) NOT NULL,
                status VARCHAR(50) NOT NULL DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)


class PaymentCreate(BaseModel):
    order_id: int
    amount: Decimal = Field(gt=0)


@app.get("/")
def home():
    return {"message": "Payment Service is running"}


@app.get("/payments")
def get_payments():
    with get_connection() as conn:
        return conn.execute(
            "SELECT * FROM payments ORDER BY id DESC"
        ).fetchall()


@app.get("/payments/{payment_id}")
def get_payment(payment_id: int):
    with get_connection() as conn:
        payment = conn.execute(
            "SELECT * FROM payments WHERE id = %s",
            (payment_id,)
        ).fetchone()

    if payment is None:
        raise HTTPException(
            status_code=404,
            detail="Payment not found"
        )

    return payment


@app.post("/payments", status_code=201)
def create_payment(
    payment_data: PaymentCreate,
    authorization: str | None = Header(default=None)
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Authentication required"
        )

    headers = {
        "Authorization": authorization
    }

    try:
        response = httpx.get(
            f"{ORDER_SERVICE_URL}/orders/{payment_data.order_id}",
            headers=headers,
            timeout=5
        )
    except httpx.RequestError:
        raise HTTPException(
            status_code=503,
            detail="Order Service is unavailable"
        )

    if response.status_code == 401:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token"
        )

    if response.status_code == 404:
        raise HTTPException(
            status_code=404,
            detail="Order not found"
        )

    if response.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail="Could not verify order"
        )

    order = response.json()

    if Decimal(str(order["total"])) != payment_data.amount:
        raise HTTPException(
            status_code=400,
            detail="Payment amount does not match order total"
        )

    if order["status"] not in ("pending", "paid"):
        raise HTTPException(
            status_code=409,
            detail="This order cannot be paid"
        )

    with get_connection() as conn:
        payment = conn.execute(
            """
            SELECT *
            FROM payments
            WHERE order_id = %s
            ORDER BY id
            LIMIT 1
            """,
            (payment_data.order_id,)
        ).fetchone()

        if payment and payment["status"] == "completed":
            return {
                "message": "Payment already completed",
                "payment": payment
            }

        if payment is None:
            payment = conn.execute(
                """
                INSERT INTO payments (order_id, amount, status)
                VALUES (%s, %s, 'pending')
                RETURNING *
                """,
                (payment_data.order_id, payment_data.amount)
            ).fetchone()

    try:
        paid_response = httpx.post(
            f"{ORDER_SERVICE_URL}/orders/{payment_data.order_id}/mark-paid",
            headers={
                "X-Internal-Token": JWT_SECRET
            },
            timeout=5
        )
    except httpx.RequestError:
        raise HTTPException(
            status_code=503,
            detail="Could not update order status"
        )

    if paid_response.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail="Payment is pending because the order status could not be updated"
        )

    with get_connection() as conn:
        completed_payment = conn.execute(
            """
            UPDATE payments
            SET status = 'completed'
            WHERE id = %s
            RETURNING *
            """,
            (payment["id"],)
        ).fetchone()

    return {
        "message": "Payment completed successfully",
        "payment": completed_payment
    }

