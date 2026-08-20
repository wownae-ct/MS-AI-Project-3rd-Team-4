"""SQLAlchemy 선언적 모델. 14개 테이블, docs/wedding/plan/04_DB_spec.md §7 DDL과 1:1 대응.

alembic env.py가 `Base.metadata`를 이 모듈에서 가져와 --autogenerate에 쓴다."""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


from app.models.benchmark import PriceBenchmark, VendorCaseExample
from app.models.chat import ChatMessage, ChatSession
from app.models.checklist import ChecklistItem, ChecklistProgress
from app.models.payment import Payment
from app.models.rag import RagChunk, RagDocument
from app.models.timeline import MilestoneTemplate, UserMilestone
from app.models.wedding import Category, Wedding, WeddingCategory

__all__ = [
    "Base",
    "Category",
    "ChatMessage",
    "ChatSession",
    "ChecklistItem",
    "ChecklistProgress",
    "MilestoneTemplate",
    "Payment",
    "PriceBenchmark",
    "RagChunk",
    "RagDocument",
    "UserMilestone",
    "VendorCaseExample",
    "Wedding",
    "WeddingCategory",
]
