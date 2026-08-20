"""FastAPI 앱 엔트리포인트. Dockerfile의 CMD(`app.main:app`)가 이 모듈을 가리킨다.

인증 없음(BASELINE v3.0 §0) — CORS는 로컬 개발 오리진만 허용, 운영은 Static Web Apps
Linked Backend 동일 오리진이라 CORS 자체가 불필요(03_API_spec.md §1)."""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.routers import budget, category, chat, dashboard, health, vendor_case, wedding

LOCAL_DEV_ORIGIN = "http://localhost:5173"

app = FastAPI(title="웨딩레이더 API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[LOCAL_DEV_ORIGIN],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """FastAPI 기본 핸들러는 detail을 {"detail": ...}로 한 번 더 감싼다 — 03_API_spec.md §2의
    {"error":{"code":...,"message":...}} 포맷과 어긋나므로, app.core.errors.api_error가 만든
    detail을 그대로 바디로 내려준다. 그 형태가 아닌 HTTPException(예: 라우팅 자체 404)은
    INTERNAL_ERROR로 감싼다."""
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": "INTERNAL_ERROR", "message": str(exc.detail)}},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Pydantic 검증 실패를 03_API_spec.md §2 VALIDATION_ERROR(422) 포맷으로 통일한다."""
    errors = exc.errors()
    message = errors[0]["msg"] if errors else "요청 검증에 실패했습니다."
    return JSONResponse(
        status_code=422, content={"error": {"code": "VALIDATION_ERROR", "message": message}}
    )


app.include_router(health.router, prefix="/api/v1")
app.include_router(wedding.router, prefix="/api/v1")
app.include_router(category.router, prefix="/api/v1")
app.include_router(budget.router, prefix="/api/v1")
app.include_router(vendor_case.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")
