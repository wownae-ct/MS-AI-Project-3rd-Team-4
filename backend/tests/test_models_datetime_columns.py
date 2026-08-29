"""DDL은 전부 TIMESTAMPTZ인데 모델에 DateTime(timezone=True)를 빠뜨려 SQLAlchemy가 TIMESTAMP(tz-naive)로
잘못 매핑하는 패턴이 이미 여러 차례(user.py/checklist.py/timeline.py/ai_invocation.py/wedding.py) 있었다
(red-bug.md #14 등). rag_documents/vendor_case_examples.created_at도 같은 패턴이 남아있었던 것을 이 테스트로
고정한다 — DB 연결 없이 컬럼 메타데이터만 확인하는 가벼운 회귀 테스트."""

from app.models.benchmark import VendorCaseExample
from app.models.rag import RagDocument


class TestCreatedAtIsTimezoneAware:
    def test_rag_document_created_at_is_timezone_aware(self):
        assert RagDocument.__table__.c.created_at.type.timezone is True

    def test_vendor_case_example_created_at_is_timezone_aware(self):
        assert VendorCaseExample.__table__.c.created_at.type.timezone is True
