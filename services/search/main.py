import os
import httpx

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Search Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080"],
    allow_methods=["*"],
    allow_headers=["*"],
)

PRODUCT_SERVICE_URL = os.environ.get(
    "PRODUCT_SERVICE_URL",
    "http://product:8000"
)


@app.get("/")
def home():
    return {"message": "Search Service is running"}


@app.get("/search")
def search_products(q: str = ""):
    try:
        response = httpx.get(
            f"{PRODUCT_SERVICE_URL}/products",
            timeout=5
        )
        response.raise_for_status()
        products = response.json()
    except httpx.RequestError:
        raise HTTPException(
            status_code=503,
            detail="Product Service is unavailable"
        )
    except httpx.HTTPStatusError:
        raise HTTPException(
            status_code=502,
            detail="Could not retrieve products"
        )

    query = q.strip().lower()

    return [
        product for product in products
        if query in product["name"].lower()
    ]
