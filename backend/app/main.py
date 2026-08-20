"""FastAPI 앱 엔트리포인트. Dockerfile의 CMD(`app.main:app`)가 이 모듈을 가리킨다.

인증 없음(BASELINE v3.0 §0) — CORS는 로컬 개발 오리진만 허용, 운영은 Static Web Apps
Linked Backend 동일 오리진이라 CORS 자체가 불필요(03_API_spec.md §1)."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import budget, category, chat, dashboard, health, vendor_case, wedding

LOCAL_DEV_ORIGIN = "http://localhost:5173"

app = FastAPI(title="웨딩레이더 API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[LOCAL_DEV_ORIGIN],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api/v1")
app.include_router(wedding.router, prefix="/api/v1")
app.include_router(category.router, prefix="/api/v1")
app.include_router(budget.router, prefix="/api/v1")
app.include_router(vendor_case.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")
