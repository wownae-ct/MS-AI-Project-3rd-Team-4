"""FastAPI 앱 엔트리포인트. Dockerfile의 CMD(`app.main:app`)가 이 모듈을 가리킨다.

v4.0(2026-08-24)부터 인증 있음(BASELINE §0 ① — v3.0의 "무인증 MVP" 스코프 컷이 번복됨).
BFF + Opaque 세션 쿠키(wr_session, HttpOnly/Secure/SameSite=Lax) 방식이라 프론트가 매 요청에
쿠키를 실어 보내야 하고, CORSMiddleware에 allow_credentials=True가 필수다(안 하면 브라우저가
크로스 오리진 요청에 쿠키를 아예 안 붙임). 프론트(Static Web Apps)와 백엔드(AKS Ingress)가 서로
다른 오리진이라 크로스 오리진 CORS 자체는 v3.0부터 필요했다 — 애초 계획이던 "SWA Linked
Backend로 동일 오리진화, CORS 불필요"는 2026-08-21 확인 결과 성립하지 않는다: Linked Backend는
Azure Functions/App Service/Container Apps/API Management만 지원하고 AKS는 대상이 아니며, 이
프로젝트의 SWA는 애초에 Linked Backend를 지원하지 않는 Free 티어다(Standard 이상 필요).
03_API_spec.md §1 갱신 완료, 상세 근거는
docs/AI-Sessions/wiki/decisions/2026-08-21-cors-not-linked-backend.md 참고."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import get_settings
from app.core.tracing import flush_tracing
from app.routers import (
    auth,
    budget,
    category,
    chat,
    checklist,
    dashboard,
    feedback,
    health,
    personalization,
    timeline,
    vendor_case,
    wedding,
)

LOCAL_DEV_ORIGIN = "http://localhost:5173"
# team4hc-swa(Free tier)의 defaultHostname. PR 프리뷰 환경은 "<defaultHostname>-<식별자>.7.azurestaticapps.net"
# 형태로 뜨므로(Azure 문서 기준) 접미사까지 정규식으로 허용 — 값이 바뀌면(SWA 재생성 등) 여기도 갱신할 것.
SWA_ORIGIN_REGEX = r"^https://polite-island-0bb189700(-[a-zA-Z0-9]+)?\.7\.azurestaticapps\.net$"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    yield
    # Langfuse는 배치로 모아 보내는 exporter라, 파드가 롤아웃 중 종료되면 마지막 trace가
    # 유실될 수 있다 — 종료 직전 명시적으로 flush(14_langfuse_tracing_design.md §4).
    flush_tracing(get_settings())


app = FastAPI(title="메리맵 API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[LOCAL_DEV_ORIGIN],
    allow_origin_regex=SWA_ORIGIN_REGEX,
    allow_credentials=True,
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
app.include_router(auth.router, prefix="/api/v1")
app.include_router(wedding.router, prefix="/api/v1")
app.include_router(category.router, prefix="/api/v1")
app.include_router(budget.router, prefix="/api/v1")
app.include_router(vendor_case.router, prefix="/api/v1")
app.include_router(checklist.router, prefix="/api/v1")
app.include_router(timeline.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")
app.include_router(feedback.router, prefix="/api/v1")
app.include_router(personalization.router, prefix="/api/v1")
