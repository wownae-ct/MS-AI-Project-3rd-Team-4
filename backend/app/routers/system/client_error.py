"""신규(2026-08-26) — POST /client-errors. 프론트 ErrorBoundary.onError(main.tsx에 안 연결돼
있던 로깅 훅)가 렌더 크래시를 원격으로 보고하는 용도(레드팀 감사 4라운드 로깅/관측성 후속,
dev-b4/dev-e4 요청 → 사용자 승인).

로그인 전 화면 크래시도 잡아야 해서 인증 불필요 — get_current_user/get_current_wedding
의존성을 안 쓴다. DB에는 안 쓰고 서버 stdout(logging)에만 남긴다 — 이건 감사 로그가 아니라
진단 목적이라 새 테이블/마이그레이션은 과설계다(CLAUDE.md YAGNI 금지목록, 레드팀 감사
4라운드가 세운 "stdout logging으로 충분" 원칙과 동일).

클라이언트 렌더 무한루프가 이 엔드포인트를 스팸할 위험이 있어 rate limit을 건다 — 로그인
전 크래시도 대상이라 user_or_ip_key(계정 우선)가 아니라 limiter 기본 키(IP)를 그대로 쓴다."""

import logging

from fastapi import APIRouter, Request, status

from app.core.rate_limit import limiter
from app.schemas.client_error import ClientErrorReportCreate

logger = logging.getLogger(__name__)

router = APIRouter(tags=["client-error"])


@router.post("/client-errors", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("20/minute")
async def report_client_error(request: Request, payload: ClientErrorReportCreate) -> None:
    logger.error(
        "Client render crash: message=%r url=%r user_agent=%r stack=%r component_stack=%r",
        payload.message,
        payload.url,
        payload.user_agent,
        payload.stack,
        payload.component_stack,
    )
