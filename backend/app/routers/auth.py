"""#2-5 — 03_API_spec.md ⓪ 인증(자체 이메일/비밀번호, Must). #2-5 뒤에 이어붙인 소셜 로그인
(구글/네이버만 — 00_BASELINE.md §0-2 Should, 카카오/애플은 이번 라운드 스코프 밖) 2개
엔드포인트(`GET /auth/{provider}/login`, `GET /auth/{provider}/callback`)는 JSON이 아니라
브라우저 전체 페이지 리다이렉트로 동작해 03_API_spec.md 문서화 대상인 나머지 엔드포인트들과
호출 방식이 달라 OpenAPI 스키마에 노출하지 않는다(`include_in_schema=False`)."""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_session
from app.core.errors import api_error
from app.core.oauth_providers import (
    OAUTH_STATE_COOKIE_NAME,
    OAUTH_STATE_TTL_SECONDS,
    build_authorization_url,
    build_callback_redirect_uri,
    generate_oauth_state,
    generate_pkce_pair,
    get_provider_config,
    is_safe_relative_redirect,
)
from app.core.rate_limit import limiter
from app.deps import get_current_user
from app.models import User
from app.schemas.auth import AuthUserOut, LoginRequest, SignupRequest
from app.services.auth import (
    authenticate_user,
    create_user,
    issue_session,
    revoke_session_by_token,
    user_has_wedding,
)
from app.services.oauth import (
    exchange_code_for_token,
    fetch_oauth_profile,
    find_or_create_social_user,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

_OAUTH_CLIENT_CREDENTIALS = {
    "GOOGLE": lambda settings: (settings.google_client_id, settings.google_client_secret),
    "NAVER": lambda settings: (settings.naver_client_id, settings.naver_client_secret),
}


def _set_session_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=settings.session_ttl_days * 24 * 60 * 60,
    )


@router.post("/signup", response_model=AuthUserOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")  # 17_qa_e2e_test_plan.md §14-2 — 크리덴셜 스터핑/봇 가입 방어
async def signup(
    payload: SignupRequest,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> AuthUserOut:
    user = await create_user(session, payload.email, payload.password, payload.display_name)
    await session.flush()
    _, raw_token = await issue_session(
        session,
        get_settings(),
        user,
        "LOCAL",
        request.headers.get("user-agent"),
        request.client.host if request.client else None,
    )
    await session.commit()
    _set_session_cookie(response, raw_token)
    return AuthUserOut(
        id=user.id, email=user.email, display_name=user.display_name, has_wedding=False
    )


@router.post("/login", response_model=AuthUserOut)
@limiter.limit("5/minute")  # 17_qa_e2e_test_plan.md §14-2 — 무차별 대입 방어(신규 발견, 최우선)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> AuthUserOut:
    user = await authenticate_user(session, payload.email, payload.password)
    _, raw_token = await issue_session(
        session,
        get_settings(),
        user,
        "LOCAL",
        request.headers.get("user-agent"),
        request.client.host if request.client else None,
    )
    has_wedding = await user_has_wedding(session, user.id)
    await session.commit()
    _set_session_cookie(response, raw_token)
    return AuthUserOut(
        id=user.id, email=user.email, display_name=user.display_name, has_wedding=has_wedding
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> None:
    """이미 로그아웃 상태여도(쿠키 없음/이미 폐기된 세션) 에러 없이 204 — idempotent(#4)."""
    settings = get_settings()
    raw_token = request.cookies.get(settings.session_cookie_name)
    if raw_token is not None:
        await revoke_session_by_token(session, raw_token)
        await session.commit()
    response.delete_cookie(key=settings.session_cookie_name)


@router.get("/me", response_model=AuthUserOut)
async def get_me(
    user: User = Depends(get_current_user),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> AuthUserOut:
    has_wedding = await user_has_wedding(session, user.id)
    return AuthUserOut(
        id=user.id, email=user.email, display_name=user.display_name, has_wedding=has_wedding
    )


@router.get("/{provider}/login", include_in_schema=False)
async def oauth_login(provider: str, redirect_to: str | None = None) -> RedirectResponse:
    """구글/네이버 로그인 시작 — IdP 인가 화면으로 307 리다이렉트한다. state(+구글만 PKCE
    code_verifier)를 짧은 httponly 쿠키에 담아 콜백까지 왕복시킨다(서버 세션 저장소가 없는
    이 프로젝트에서 CSRF 방어를 위한 가장 단순한 방법 — Redis 등 별도 저장소 도입 금지
    원칙과도 맞는다).

    redirect_to(선택, 2026-08-26 레드팀 감사 대응)는 로그인 전 있던 화면으로 돌아가기 위한
    앱 내부 상대경로다 — is_safe_relative_redirect가 거부하면(오픈 리다이렉트 위험 또는
    형식 오류) 조용히 무시하고 기존처럼 루트로 보낸다(로그인 자체를 막을 이유는 아니다)."""
    config = get_provider_config(provider)
    if config is None:
        raise api_error(404, "NOT_FOUND", f"지원하지 않는 로그인 방식입니다: {provider}")
    if redirect_to is not None and not is_safe_relative_redirect(redirect_to):
        redirect_to = None

    settings = get_settings()
    client_id, _ = _OAUTH_CLIENT_CREDENTIALS[config.code](settings)
    state = generate_oauth_state()
    code_verifier, code_challenge = generate_pkce_pair() if config.supports_pkce else (None, None)
    redirect_uri = build_callback_redirect_uri(settings.oauth_backend_base_url, provider)
    authorization_url = build_authorization_url(
        config,
        client_id=client_id,
        redirect_uri=redirect_uri,
        state=state,
        code_challenge=code_challenge,
    )

    response = RedirectResponse(
        url=authorization_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT
    )
    response.set_cookie(
        key=OAUTH_STATE_COOKIE_NAME,
        value=json.dumps(
            {"state": state, "code_verifier": code_verifier, "redirect_to": redirect_to}
        ),
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=OAUTH_STATE_TTL_SECONDS,
    )
    return response


@router.get("/{provider}/callback", include_in_schema=False)
async def oauth_callback(
    provider: str,
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> RedirectResponse:
    """IdP가 인가 후 되돌아오는 콜백. 이 요청은 브라우저의 최상위 페이지 이동이라(fetch/XHR이
    아님) 실패해도 원시 JSON을 그대로 보여주면 안 되고, 항상 프론트 화면(로그인 성공 시 홈,
    실패 시 로그인 화면 + 에러 쿼리)으로 리다이렉트한다."""
    settings = get_settings()
    config = get_provider_config(provider)
    login_page = f"{settings.frontend_base_url}/login"

    if config is None:
        return RedirectResponse(f"{login_page}?oauth_error=unsupported_provider")
    if error is not None or code is None:
        return RedirectResponse(f"{login_page}?oauth_error=denied")

    raw_state_cookie = request.cookies.get(OAUTH_STATE_COOKIE_NAME)
    if raw_state_cookie is None:
        return RedirectResponse(f"{login_page}?oauth_error=state_missing")
    try:
        state_payload = json.loads(raw_state_cookie)
    except json.JSONDecodeError:
        return RedirectResponse(f"{login_page}?oauth_error=state_invalid")
    if state is None or state != state_payload.get("state"):
        return RedirectResponse(f"{login_page}?oauth_error=state_mismatch")

    client_id, client_secret = _OAUTH_CLIENT_CREDENTIALS[config.code](settings)
    redirect_uri = build_callback_redirect_uri(settings.oauth_backend_base_url, provider)
    try:
        access_token = await exchange_code_for_token(
            config,
            code=code,
            code_verifier=state_payload.get("code_verifier"),
            redirect_uri=redirect_uri,
            client_id=client_id,
            client_secret=client_secret,
        )
        profile = await fetch_oauth_profile(config, access_token)
        user = await find_or_create_social_user(session, config.code, profile)
    except HTTPException as exc:
        # find_or_create_social_user가 던지는 EMAIL_ALREADY_EXISTS/SOCIAL_ACCOUNT_ALREADY_LINKED
        # 등 — 이 흐름은 브라우저 최상위 페이지 이동이라 원시 JSON을 그대로 보여주면 안 되고
        # 에러 코드를 쿼리 파라미터로 실어 로그인 화면으로 돌려보낸다.
        await session.rollback()
        detail = exc.detail if isinstance(exc.detail, dict) else {}
        error_code = detail.get("error", {}).get("code", "UNKNOWN_ERROR")
        # 2026-08-26 레드팀 감사 4라운드 항목 17 — 계정 연동 충돌(이미 다른 방식으로 가입된
        # 이메일 등)이 무로깅이었다.
        logger.warning("OAuth account link conflict for provider=%s: %s", provider, error_code)
        return RedirectResponse(f"{login_page}?oauth_error={error_code}")
    except Exception:
        # IdP 쪽 네트워크/타임아웃/응답형식 오류 — 브라우저 리다이렉트 흐름이라 로그인 화면으로
        # 안전하게 돌려보낸다(app/services/chat.py의 SSE event:error와 같은 이유로, 이 경계
        # 하나에서만 광범위 캐치). 2026-08-26 레드팀 감사 4라운드 항목 3 — 이 경계가 CI로
        # 커버 안 되는(수동 검증만 하는) 토큰 교환 경로라 무로깅이면 실전 장애를 놓친다.
        logger.exception("OAuth callback upstream failure for provider=%s", provider)
        await session.rollback()
        return RedirectResponse(f"{login_page}?oauth_error=upstream_failed")

    _, raw_token = await issue_session(
        session,
        settings,
        user,
        config.code,
        request.headers.get("user-agent"),
        request.client.host if request.client else None,
    )
    await session.commit()

    redirect_to = state_payload.get("redirect_to")
    destination = (
        f"{settings.frontend_base_url}{redirect_to}" if redirect_to else settings.frontend_base_url
    )
    response = RedirectResponse(url=destination)
    _set_session_cookie(response, raw_token)
    response.delete_cookie(key=OAUTH_STATE_COOKIE_NAME)
    return response
