"""FastAPI 앱 엔트리포인트. Dockerfile의 CMD(`app.gateway.main:app`)가 이 모듈을 가리킨다."""

from fastapi import FastAPI

from app.gateway.routers import admin, health, movements, profile, sessions, ws

app = FastAPI(title="AI 홈트레이닝 코치 API", version="0.1.0")

app.include_router(health.router)
app.include_router(sessions.router, prefix="/api/v1")
app.include_router(movements.router, prefix="/api/v1")
app.include_router(profile.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
app.include_router(ws.router)
