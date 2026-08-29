"""app/core/config.py::Settings의 배포-선택 프로퍼티(chat_rag_deployment/receipt_vision_
deployment) — 값이 없으면 azure_openai_chat_deployment로 폴백하고, 있으면 그 값을 그대로 쓰는지
확인한다. 챗 그래프만 별도 모델(gpt-5.4)로 A/B하고 싶을 때 이 값만 바꾸면 개인화/영수증OCR엔
영향이 없어야 한다는 게 이 파일의 핵심 회귀 대상."""

from app.core.config import Settings

_BASE_KWARGS = {
    "database_url": "postgresql://test",
    "azure_openai_endpoint": "https://test.openai.azure.com",
    "google_client_id": "test",
    "google_client_secret": "test",
    "naver_client_id": "test",
    "naver_client_secret": "test",
    "azure_storage_blob_endpoint": "https://test.blob.core.windows.net",
}


class TestChatRagDeployment:
    def test_falls_back_to_azure_openai_chat_deployment_when_unset(self):
        settings = Settings(**_BASE_KWARGS)

        assert settings.chat_rag_deployment == settings.azure_openai_chat_deployment == "chat-mini"

    def test_uses_override_when_set(self):
        settings = Settings(**_BASE_KWARGS, azure_openai_chat_rag_deployment="chat")

        assert settings.chat_rag_deployment == "chat"
        # 오버라이드는 챗 전용 값만 바꾼다 — 나머지 설정은 그대로 chat-mini를 가리켜야 한다.
        assert settings.azure_openai_chat_deployment == "chat-mini"

    def test_override_does_not_affect_receipt_vision_deployment(self):
        # 챗만 gpt-5.4로 바꿔도 영수증 OCR은 여전히 azure_openai_chat_deployment(chat-mini)를
        # 폴백으로 써야 한다 — 두 프로퍼티는 서로 독립된 오버라이드 필드를 참조한다.
        settings = Settings(**_BASE_KWARGS, azure_openai_chat_rag_deployment="chat")

        assert settings.receipt_vision_deployment == "chat-mini"


class TestReceiptVisionDeployment:
    def test_falls_back_to_azure_openai_chat_deployment_when_unset(self):
        settings = Settings(**_BASE_KWARGS)

        assert settings.receipt_vision_deployment == "chat-mini"

    def test_uses_override_when_set(self):
        settings = Settings(**_BASE_KWARGS, azure_openai_receipt_vision_deployment="chat")

        assert settings.receipt_vision_deployment == "chat"
        # 영수증 OCR 오버라이드는 챗 그래프 배포 선택에 영향을 주지 않아야 한다.
        assert settings.chat_rag_deployment == "chat-mini"
