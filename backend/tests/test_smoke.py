"""엔드포인트 스모크 테스트 — 09_backend_implementation_plan.md §4/§6 DoD: 30개 엔드포인트 각각
"정상 요청 시 200/201" 확인 + 인증이 필요한 엔드포인트는 "세션 쿠키 없이 401"을 함께 확인한다.

아직 30개 전부를 커버하지 않는다 — GET /categories(#11)부터 시작해서 chat_sessions/
feedback_reports 구현이 끝나는 대로 해당 엔드포인트의 스모크 케이스를 이어서 추가한다.

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
