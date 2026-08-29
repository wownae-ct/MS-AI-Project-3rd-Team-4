"""app/core/config.py::Settings의 배포-선택 프로퍼티(chat_rag_deployment/receipt_vision_
deployment) — chat_rag_deployment는 2026-08-29 A/B 비교 결과로 기본값 자체가 "chat"(gpt-5.4)로
바뀌었다(개인화/영수증OCR은 여전히 azure_openai_chat_deployment="chat-mini" 기본). 이 파일의
핵심 회귀 대상은 (1) 챗이 실제로 gpt-5.4를 기본으로 쓰는지, (2) 오버라이드가 여전히 동작하는지,
(3) 챗 쪽 기본값 변경이 개인화/영수증OCR로 새지 않는지 세 가지다."""

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
    def test_defaults_to_chat_gpt54_deployment(self):
        # 2026-08-29 A/B 비교(docs/wedding/ing/gpt54-vs-mini-comparison-2026-08-29.md) 이후
        # 챗 그래프의 실제 기본값 — 개인화가 쓰는 azure_openai_chat_deployment(chat-mini)와는
        # 이제 의도적으로 다르다.
        settings = Settings(**_BASE_KWARGS)

        assert settings.chat_rag_deployment == "chat"
        assert settings.azure_openai_chat_deployment == "chat-mini"

    def test_override_still_works(self):
        # 다른 모델로 다시 A/B하거나 mini로 되돌리고 싶을 때를 위한 오버라이드 경로가 여전히
        # 살아있는지 확인한다.
        settings = Settings(**_BASE_KWARGS, azure_openai_chat_rag_deployment="chat-mini")

        assert settings.chat_rag_deployment == "chat-mini"

    def test_default_does_not_leak_into_receipt_vision_deployment(self):
        # 챗의 기본값이 gpt-5.4로 바뀌었어도 영수증 OCR은 여전히 azure_openai_chat_deployment
        # (chat-mini)를 폴백으로 써야 한다 — 두 프로퍼티는 서로 독립된 오버라이드 필드를 참조한다.
        settings = Settings(**_BASE_KWARGS)

        assert settings.receipt_vision_deployment == "chat-mini"


class TestReceiptVisionDeployment:
    def test_falls_back_to_azure_openai_chat_deployment_when_unset(self):
        settings = Settings(**_BASE_KWARGS)

        assert settings.receipt_vision_deployment == "chat-mini"

    def test_uses_override_when_set(self):
        settings = Settings(**_BASE_KWARGS, azure_openai_receipt_vision_deployment="chat")

        assert settings.receipt_vision_deployment == "chat"
        # 영수증 OCR 오버라이드는 챗 그래프 배포 선택에 영향을 주지 않아야 한다 — chat_rag_
        # deployment는 자기 자신의 기본값("chat")을 그대로 유지해야 한다.
        assert settings.chat_rag_deployment == "chat"
