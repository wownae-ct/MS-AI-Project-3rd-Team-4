"""FastAPI 앱 엔트리포인트. Dockerfile의 CMD(`app.gateway.main:app`)가 이 모듈을 가리킨다."""

from app.gateway.routers import admin, answers, health, questions, reports, sessions
from fastapi import FastAPI

app = FastAPI(title="브리프코치 API", version="0.1.0")

app.include_router(health.router)
app.include_router(questions.router, prefix="/api/v1")
app.include_router(sessions.router, prefix="/api/v1")
app.include_router(answers.router, prefix="/api/v1")
app.include_router(reports.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
