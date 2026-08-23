"""app/services/oauth.py의 find_or_create_social_user 실DB 통합 테스트 — DB 세션이 필요한
로직은 이 레포 기존 컨벤션대로 라이브 DB로 검증한다(app/services/wedding.py 등과 동일 패턴).
conftest.py의 client 픽스처는 HTTP 계층까지 거치는데, 이 함수는 실 IdP 토큰교환 없이는 HTTP로
못 부르므로(exchange_code_for_token/fetch_oauth_profile은 실 크레덴셜 필요, 이 테스트 범위
밖) app/core/db.py의 세션 팩토리를 직접 써서 서비스 함수 하나만 호출한다.

각 테스트가 만든 유저 행은 끝에 직접 지운다(다른 스모크 테스트처럼 정리 인프라에 기대지 않고
이 파일 안에서 자기완결)."""

from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import delete

from app.core.db import get_session_factory
from app.models import User
from app.services.auth import create_user
from app.services.oauth import OAuthProfile, find_or_create_social_user


def _make_profile(provider_user_id: str, email: str, **overrides) -> OAuthProfile:
    defaults = {"email_verified": True, "display_name": "테스트유저", "profile_image_url": None}
    defaults.update(overrides)
    return OAuthProfile(provider_user_id=provider_user_id, email=email, **defaults)


async def _delete_user(session, user_id) -> None:
    await session.execute(delete(User).where(User.id == user_id))
    await session.commit()


class TestFindOrCreateSocialUser:
    async def test_creates_new_user_when_no_existing_account(self):
        unique = uuid4().hex[:12]
        profile = _make_profile(f"google-{unique}", f"oauth-{unique}@example.com")

        async with get_session_factory()() as session:
            user = await find_or_create_social_user(session, "GOOGLE", profile)
            await session.commit()
            try:
                assert user.auth_provider == "GOOGLE"
                assert user.auth_provider_id == profile.provider_user_id
                assert user.email == profile.email
                assert user.password_hash is None
                assert user.email_verified_at is not None
            finally:
                await _delete_user(session, user.id)

    async def test_repeat_login_returns_same_user(self):
        unique = uuid4().hex[:12]
        profile = _make_profile(f"google-{unique}", f"oauth-{unique}@example.com")

        async with get_session_factory()() as session:
            first = await find_or_create_social_user(session, "GOOGLE", profile)
            await session.commit()
            try:
                second = await find_or_create_social_user(session, "GOOGLE", profile)
                assert second.id == first.id
            finally:
                await _delete_user(session, first.id)

    async def test_links_existing_local_account_by_email(self):
        unique = uuid4().hex[:12]
        email = f"local-{unique}@example.com"

        async with get_session_factory()() as session:
            local_user = await create_user(session, email, "smoke-test-password", "로컬유저")
            await session.commit()
            try:
                profile = _make_profile(f"naver-{unique}", email, display_name="네이버이름")
                linked = await find_or_create_social_user(session, "NAVER", profile)
                await session.commit()

                assert linked.id == local_user.id
                assert linked.auth_provider == "NAVER"
                assert linked.auth_provider_id == profile.provider_user_id
                # 기존 비밀번호 로그인 수단은 그대로 살아있어야 한다 — 소셜 연동이 지운 게 아님.
                assert linked.password_hash is not None
            finally:
                await _delete_user(session, local_user.id)

    async def test_rejects_when_email_already_linked_to_another_provider(self):
        unique = uuid4().hex[:12]
        email = f"dup-{unique}@example.com"

        async with get_session_factory()() as session:
            first_profile = _make_profile(f"google-{unique}", email)
            first_user = await find_or_create_social_user(session, "GOOGLE", first_profile)
            await session.commit()
            try:
                second_profile = _make_profile(f"naver-{unique}", email)
                with pytest.raises(HTTPException) as exc_info:
                    await find_or_create_social_user(session, "NAVER", second_profile)
                assert exc_info.value.status_code == 409
                assert exc_info.value.detail["error"]["code"] == "SOCIAL_ACCOUNT_ALREADY_LINKED"
            finally:
                await _delete_user(session, first_user.id)
