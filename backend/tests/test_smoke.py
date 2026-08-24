"""엔드포인트 스모크 테스트 — 09_backend_implementation_plan.md §4/§6 DoD: 문서화된 엔드포인트
각각 "정상 요청 시 200/201" 확인 + 인증이 필요한 엔드포인트는 "세션 쿠키 없이 401"을 함께
확인한다. 03_API_spec.md의 v3.0 기준 30개에 v4.0 신규 #31(GET /benchmarks/total-average,
00_BASELINE.md §2-5) + 스코프 밖 승격 #32(POST /personalization/regenerate,
15_post_v4_scope_promotion.md §P2)가 더해져 지금은 32개.

아직 32개 전부를 커버하지 않는다 — GET /categories(#11), chat_sessions(#27-29),
feedback_reports(#30), dashboard/summary·reports/me(#25-26), benchmarks/total-average(#31),
personalization/regenerate(#32)까지 완료. 나머지 엔드포인트는 해당 기능 구현 시 이어서
추가한다. 소셜 로그인(구글/네이버, Should, 03_API_spec.md에 없는 번외 엔드포인트)의 리다이렉트
배선도 TestOAuthSmoke로 커버.

GET /categories는 03_API_spec.md §5 인증 필수 목록(`/weddings*` 등)에 없는 유일한 부류의
엔드포인트라 401 케이스가 없다 — 세션 쿠키 없이도 항상 200이어야 하는 게 맞는 동작이다."""

from uuid import uuid4


class TestCategoriesSmoke:
    async def test_get_categories_returns_200_with_nine_items(self, client):
        # 픽스처가 만드는 client는 쿠키를 전혀 들고 있지 않다 — 이 호출 자체가 이미
        # "세션 쿠키 없이도 200"을 검증한다.
        response = await client.get("/categories")

        assert response.status_code == 200
        body = response.json()
        assert len(body["categories"]) == 9


class TestChatSessionsSmoke:
    """#27/#28/#29 — 실LLM 호출(#29 성공 플로우)은 비용/지연 때문에 자동 스모크에 넣지 않고
    2026-08-24 chat_sessions v4.0 재구현 시점에 수동으로 1회 실행해 확인했다(회귀 시엔 다시
    수동 확인). 여기서는 인증/소유권 배선(이번에 발견한 보안 구멍의 재발 방지)만 자동화한다."""

    async def test_create_session_returns_201(self, wedding_client):
        response = await wedding_client.post("/chat/sessions", json={"category_code": "VENUE"})

        assert response.status_code == 201
        body = response.json()
        assert body["category_code"] == "VENUE"
        assert body["title"] is None

    async def test_create_global_session_without_category_returns_201(self, wedding_client):
        # 12_final_prototype_mockup.html 하단 탭바의 카테고리 무관 전역 "AI상담" — category_code
        # 생략(또는 null)이면 전역 세션으로 만들어져야 한다(2026-08-24 발견 갭 수정).
        response = await wedding_client.post("/chat/sessions", json={})

        assert response.status_code == 201
        body = response.json()
        assert body["category_code"] is None
        assert body["title"] is None

    async def test_create_session_without_cookie_returns_401(self, client):
        response = await client.post("/chat/sessions", json={"category_code": "VENUE"})

        assert response.status_code == 401

    async def test_list_messages_on_fresh_session_returns_200_empty(self, wedding_client):
        created = await wedding_client.post("/chat/sessions", json={"category_code": "VENUE"})
        session_id = created.json()["id"]

        response = await wedding_client.get(f"/chat/sessions/{session_id}/messages")

        assert response.status_code == 200
        assert response.json()["messages"] == []

    async def test_list_messages_without_cookie_returns_401(self, client):
        response = await client.get(f"/chat/sessions/{uuid4()}/messages")

        assert response.status_code == 401

    async def test_list_messages_on_other_users_session_returns_404(
        self, wedding_client, make_wedding_client
    ):
        created = await wedding_client.post("/chat/sessions", json={"category_code": "VENUE"})
        session_id = created.json()["id"]

        other_client = await make_wedding_client()
        response = await other_client.get(f"/chat/sessions/{session_id}/messages")

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "CHAT_SESSION_NOT_FOUND"

    async def test_send_message_on_nonexistent_session_returns_404_before_streaming(
        self, wedding_client
    ):
        response = await wedding_client.post(
            f"/chat/sessions/{uuid4()}/messages", json={"content": "안녕하세요"}
        )

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "CHAT_SESSION_NOT_FOUND"

    async def test_send_message_without_cookie_returns_401(self, client):
        response = await client.post(
            f"/chat/sessions/{uuid4()}/messages", json={"content": "안녕하세요"}
        )

        assert response.status_code == 401

    async def test_send_message_passes_owner_user_id_to_tracing_entrypoint(
        self, wedding_client, monkeypatch
    ):
        """실LLM 스트리밍은 자동 스모크 대상이 아니므로(클래스 docstring) 서비스 진입점만
        기록용으로 바꿔치기해 라우터→서비스 인자 배선을 검증한다 — DB/외부 API는 모킹하지
        않는다(웨딩/세션/유저 id는 전부 실제 API로 만들고 읽는다). app/routers/chat.py가
        `from app.services.chat import stream_chat_response`로 심볼을 직접 import하므로
        app.routers.chat 네임스페이스를 패치해야 한다."""
        recorded: list[tuple[tuple, dict]] = []

        def _recording_stream(*args, **kwargs):
            recorded.append((args, kwargs))

            async def _empty_stream():
                return
                yield  # pragma: no cover

            return _empty_stream()

        monkeypatch.setattr("app.routers.chat.stream_chat_response", _recording_stream)

        me = await wedding_client.get("/auth/me")
        created = await wedding_client.post("/chat/sessions", json={"category_code": "VENUE"})
        session_id = created.json()["id"]

        response = await wedding_client.post(
            f"/chat/sessions/{session_id}/messages", json={"content": "안녕하세요"}
        )

        assert response.status_code == 200
        assert len(recorded) == 1
        _, kwargs = recorded[0]
        assert str(kwargs["owner_user_id"]) == me.json()["id"]


class TestChatMessageRatingSmoke:
    """작업 3 — POST /chat/sessions/{id}/messages/{message_id}/feedback. 실LLM 스트리밍이
    필요 없어 make_assistant_message 픽스처로 assistant 메시지 행을 직접 만들어 쓴다(#29와
    동일하게 실LLM 경로는 자동 스모크 대상이 아님). trace_ref가 있는 케이스는 실제로 Langfuse
    Score API를 호출한다(이 프로젝트 컨벤션: 가짜 점수를 스크립트로 밀어넣지 않고 실제 엔드포인트
    호출로만 검증)."""

    async def test_rate_own_assistant_message_returns_200(
        self, wedding_client, make_assistant_message
    ):
        session_id, message_id = await make_assistant_message(
            wedding_client, trace_ref=f"smoke-trace-{uuid4().hex}"
        )

        response = await wedding_client.post(
            f"/chat/sessions/{session_id}/messages/{message_id}/feedback",
            json={"rating": "GOOD"},
        )

        assert response.status_code == 200
        assert response.json() == {"message_id": message_id, "rating": "GOOD"}

    async def test_rating_is_overwritten_on_second_call(
        self, wedding_client, make_assistant_message
    ):
        session_id, message_id = await make_assistant_message(
            wedding_client, trace_ref=f"smoke-trace-{uuid4().hex}"
        )

        first = await wedding_client.post(
            f"/chat/sessions/{session_id}/messages/{message_id}/feedback",
            json={"rating": "GOOD"},
        )
        second = await wedding_client.post(
            f"/chat/sessions/{session_id}/messages/{message_id}/feedback",
            json={"rating": "BAD"},
        )

        assert first.status_code == 200
        assert second.status_code == 200
        assert second.json()["rating"] == "BAD"

    async def test_rate_message_without_trace_ref_still_returns_200(
        self, wedding_client, make_assistant_message
    ):
        session_id, message_id = await make_assistant_message(wedding_client, trace_ref=None)

        response = await wedding_client.post(
            f"/chat/sessions/{session_id}/messages/{message_id}/feedback",
            json={"rating": "GOOD"},
        )

        assert response.status_code == 200

    async def test_rate_user_role_message_returns_400(self, wedding_client, make_assistant_message):
        session_id, message_id = await make_assistant_message(wedding_client, role="user")

        response = await wedding_client.post(
            f"/chat/sessions/{session_id}/messages/{message_id}/feedback",
            json={"rating": "GOOD"},
        )

        assert response.status_code == 400
        assert response.json()["error"]["code"] == "CHAT_MESSAGE_NOT_RATABLE"

    async def test_rate_nonexistent_message_returns_404(
        self, wedding_client, make_assistant_message
    ):
        session_id, _ = await make_assistant_message(wedding_client)

        response = await wedding_client.post(
            f"/chat/sessions/{session_id}/messages/{uuid4()}/feedback",
            json={"rating": "GOOD"},
        )

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "CHAT_MESSAGE_NOT_FOUND"

    async def test_rate_message_from_another_session_of_same_wedding_returns_404(
        self, wedding_client, make_assistant_message
    ):
        _, message_id = await make_assistant_message(wedding_client)
        other_session_id, _ = await make_assistant_message(wedding_client)

        response = await wedding_client.post(
            f"/chat/sessions/{other_session_id}/messages/{message_id}/feedback",
            json={"rating": "GOOD"},
        )

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "CHAT_MESSAGE_NOT_FOUND"

    async def test_rate_other_users_message_returns_404(
        self, wedding_client, make_assistant_message, make_wedding_client
    ):
        session_id, message_id = await make_assistant_message(wedding_client)
        other_client = await make_wedding_client()

        response = await other_client.post(
            f"/chat/sessions/{session_id}/messages/{message_id}/feedback",
            json={"rating": "GOOD"},
        )

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "CHAT_MESSAGE_NOT_FOUND"

    async def test_rate_without_cookie_returns_401(self, client):
        response = await client.post(
            f"/chat/sessions/{uuid4()}/messages/{uuid4()}/feedback",
            json={"rating": "GOOD"},
        )

        assert response.status_code == 401

    async def test_invalid_rating_value_returns_422(self, wedding_client, make_assistant_message):
        session_id, message_id = await make_assistant_message(wedding_client)

        response = await wedding_client.post(
            f"/chat/sessions/{session_id}/messages/{message_id}/feedback",
            json={"rating": "MEH"},
        )

        assert response.status_code == 422

    async def test_missing_rating_field_returns_422(self, wedding_client, make_assistant_message):
        session_id, message_id = await make_assistant_message(wedding_client)

        response = await wedding_client.post(
            f"/chat/sessions/{session_id}/messages/{message_id}/feedback", json={}
        )

        assert response.status_code == 422

    async def test_list_messages_includes_user_rating(self, wedding_client, make_assistant_message):
        session_id, message_id = await make_assistant_message(wedding_client)
        await wedding_client.post(
            f"/chat/sessions/{session_id}/messages/{message_id}/feedback",
            json={"rating": "GOOD"},
        )

        response = await wedding_client.get(f"/chat/sessions/{session_id}/messages")

        rated = next(m for m in response.json()["messages"] if m["id"] == message_id)
        assert rated["user_rating"] == "GOOD"


class TestFeedbackReportsSmoke:
    """#30 — POST /weddings가 온보딩 시 timeline_items 55개를 결정론적으로 생성하므로,
    별도 셋업 없이 그중 하나를 target으로 써서 실 소유권 검증 경로를 그대로 탄다."""

    async def test_create_report_on_own_timeline_item_returns_201(self, wedding_client):
        items = (await wedding_client.get("/timeline-items")).json()["items"]
        target_id = items[0]["id"]

        response = await wedding_client.post(
            "/feedback-reports",
            json={
                "target_type": "TIMELINE_ITEM",
                "target_id": target_id,
                "reason_category": "부정확함",
                "comment": "날짜가 이상해요",
            },
        )

        assert response.status_code == 201
        body = response.json()
        assert body["status"] == "OPEN"

    async def test_create_report_without_cookie_returns_401(self, client):
        response = await client.post(
            "/feedback-reports",
            json={
                "target_type": "TIMELINE_ITEM",
                "target_id": str(uuid4()),
                "reason_category": "부정확함",
            },
        )

        assert response.status_code == 401

    async def test_create_report_on_nonexistent_target_returns_404(self, wedding_client):
        response = await wedding_client.post(
            "/feedback-reports",
            json={
                "target_type": "TIMELINE_ITEM",
                "target_id": str(uuid4()),
                "reason_category": "부정확함",
            },
        )

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "FEEDBACK_TARGET_NOT_FOUND"

    async def test_create_report_on_other_users_target_returns_404(
        self, wedding_client, make_wedding_client
    ):
        items = (await wedding_client.get("/timeline-items")).json()["items"]
        target_id = items[0]["id"]

        other_client = await make_wedding_client()
        response = await other_client.post(
            "/feedback-reports",
            json={
                "target_type": "TIMELINE_ITEM",
                "target_id": target_id,
                "reason_category": "부정확함",
            },
        )

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "FEEDBACK_TARGET_NOT_FOUND"

    async def test_create_report_with_invalid_reason_category_returns_422(self, wedding_client):
        items = (await wedding_client.get("/timeline-items")).json()["items"]
        target_id = items[0]["id"]

        response = await wedding_client.post(
            "/feedback-reports",
            json={
                "target_type": "TIMELINE_ITEM",
                "target_id": target_id,
                "reason_category": "그냥싫음",
            },
        )

        assert response.status_code == 422


class TestDashboardSmoke:
    """#25/#26 — 온보딩(POST /weddings)이 이미 checklist_items 24개(또는 폴백) + timeline_items
    55개 + wedding_categories 9행(전부 is_active=True)을 만들어두므로 별도 셋업이 필요 없다."""

    async def test_dashboard_summary_returns_200_with_all_categories_active(self, wedding_client):
        response = await wedding_client.get("/dashboard/summary")

        assert response.status_code == 200
        body = response.json()
        assert body["total_budget"] == 50_000_000
        assert len(body["categories"]) == 9
        assert all(c["is_active"] for c in body["categories"])

    async def test_dashboard_summary_without_cookie_returns_401(self, client):
        response = await client.get("/dashboard/summary")

        assert response.status_code == 401

    async def test_dashboard_summary_upcoming_items_have_expected_shape(self, wedding_client):
        response = await wedding_client.get("/dashboard/summary")

        items = response.json()["upcoming_items"]
        assert 0 < len(items) <= 5
        for item in items:
            assert item["source"] in ("timeline", "checklist")
            assert item["title"]

    async def test_my_report_returns_200(self, wedding_client):
        response = await wedding_client.get("/reports/me")

        assert response.status_code == 200
        body = response.json()
        assert body["budget_summary"]["total_budget"] == 50_000_000
        assert len(body["next_recommended_checks"]) <= 5

    async def test_my_report_without_cookie_returns_401(self, client):
        response = await client.get("/reports/me")

        assert response.status_code == 401


class TestOAuthSmoke:
    """소셜 로그인(구글/네이버, 00_BASELINE.md §0-2 Should) — 실 IdP 토큰교환/유저정보 조회는
    실 크레덴셜이 있어야 해서(비용은 없지만 CI/로컬 dev 크레덴셜 미보유) 자동 스모크 대상이
    아니다(app/services/oauth.py의 find_or_create_social_user 계정 연동 로직은
    tests/test_oauth_service.py가 실DB로 직접 검증). 여기서는 IdP 호출 전 단계(로그인 리다이렉트
    조립, 콜백의 state 검증)만 확인한다 — httpx AsyncClient는 기본이 follow_redirects=False라
    307 응답 자체를 그대로 받을 수 있다."""

    async def test_login_redirects_to_google_authorize_endpoint(self, client):
        response = await client.get("/auth/google/login")

        assert response.status_code == 307
        assert response.headers["location"].startswith("https://accounts.google.com/")
        assert "wr_oauth_state" in response.cookies

    async def test_login_redirects_to_naver_authorize_endpoint(self, client):
        response = await client.get("/auth/naver/login")

        assert response.status_code == 307
        assert response.headers["location"].startswith("https://nid.naver.com/")

    async def test_login_unsupported_provider_returns_404(self, client):
        response = await client.get("/auth/kakao/login")

        assert response.status_code == 404

    async def test_callback_without_state_cookie_redirects_to_login_with_error(self, client):
        response = await client.get("/auth/google/callback", params={"code": "x", "state": "s"})

        assert response.status_code < 400  # RedirectResponse, 에러가 아니라 안내 리다이렉트
        assert response.headers["location"].startswith("http://localhost:5173/login")
        assert "oauth_error=state_missing" in response.headers["location"]

    async def test_callback_with_mismatched_state_redirects_with_error(self, client):
        login_response = await client.get("/auth/google/login")
        assert login_response.status_code == 307

        callback_response = await client.get(
            "/auth/google/callback", params={"code": "x", "state": "not-the-real-state"}
        )

        assert "oauth_error=state_mismatch" in callback_response.headers["location"]


class TestBenchmarksSmoke:
    """#31 GET /benchmarks/total-average — 00_BASELINE.md §2-5 예산 "미정" 슬라이더
    플레이스홀더. 웨딩 생성 전(온보딩 중) 호출되는 엔드포인트라 wedding_client가 아니라
    signed_up_client로 검증한다. #23 GET /benchmarks/compare는 이 세션 범위 밖(기존 미커버
    엔드포인트, 이 파일 상단 docstring 참고)이라 여기서 같이 채우지 않는다.

    200 케이스는 total_budget_benchmark 픽스처(conftest.py)로 데이터를 직접 만든다 — 처음엔
    "ETL이 이미 채워뒀으니 실 시드에 기대면 된다"고 가정했다가 CI(마이그레이션만 적용된 빈
    DB, ETL 시드 없음)에서 404로 떨어져 PR #41이 깨졌다(2026-08-24). 로컬 dev DB에만 있는
    데이터에 기대는 스모크 테스트는 이 실패 패턴 자체가 재발 위험이라 직접 데이터를 준비하는
    쪽으로 고쳤다.

    404(TOTAL_BUDGET_UNAVAILABLE) 케이스는 여기 없다 — 로컬 dev DB는 이미 RegionCode Literal
    17개 유효값 전부가 지역 폴백 체인(특정 지역→수도권/비수도권→전국)을 거쳐서라도 매치되도록
    실 시드가 차 있어서, "유효한 region_code인데 매치되는 게 하나도 없는" 상태를 로컬/CI
    양쪽에서 똑같이 재현할 방법이 없다."""

    async def test_total_average_returns_200_for_valid_region(
        self, signed_up_client, total_budget_benchmark
    ):
        response = await signed_up_client.get(
            "/benchmarks/total-average", params={"region_code": "SEOUL_GANGNAM"}
        )

        assert response.status_code == 200
        body = response.json()
        assert body["region_code"] == "SEOUL_GANGNAM"
        assert body["median_price"] == 45_000_000

    async def test_total_average_without_cookie_returns_401(self, client):
        response = await client.get(
            "/benchmarks/total-average", params={"region_code": "SEOUL_GANGNAM"}
        )

        assert response.status_code == 401


class TestPersonalizationRegenerateSmoke:
    """#32 POST /personalization/regenerate — MANUAL_REGENERATE(15_post_v4_scope_promotion.md
    §P2). generate 노드가 실LLM을 호출하므로 TestChatSessionsSmoke와 같은 원칙으로 SUCCESS/
    BLOCKED 응답까지 가는 실행 경로는 자동 스모크에 넣지 않는다 — 2026-08-24 구현 시점에
    수동으로 1회 실행해 checklist_items/timeline_items 교체와 ai_invocations 행 기록을
    확인했다(회귀 시엔 다시 수동 확인). 여기서는 인증 배선과 요청 검증(도메인 비어있음/중복)만
    자동화한다 — 둘 다 route/generate 노드에 도달하기 전에 걸러지므로 LLM 호출이 없다."""

    async def test_regenerate_without_cookie_returns_401(self, client):
        response = await client.post("/personalization/regenerate", json={"domains": ["CHECKLIST"]})

        assert response.status_code == 401

    async def test_regenerate_empty_domains_returns_422(self, wedding_client):
        response = await wedding_client.post("/personalization/regenerate", json={"domains": []})

        assert response.status_code == 422

    async def test_regenerate_duplicate_domains_returns_422(self, wedding_client):
        response = await wedding_client.post(
            "/personalization/regenerate", json={"domains": ["CHECKLIST", "CHECKLIST"]}
        )

        assert response.status_code == 422
