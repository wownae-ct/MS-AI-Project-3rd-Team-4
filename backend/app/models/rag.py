"""rag_documents / rag_chunks — 04_DB_spec.md §4-(11)(12), §7 DDL.

embedding은 pgvector Vector(1536), tsv는 Postgres GENERATED STORED 컬럼(Computed).
Importer: app/models/__init__.py."""

from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    ARRAY,
    BigInteger,
    CheckConstraint,
    Computed,
    Date,
    ForeignKey,
    Integer,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base

EMBEDDING_DIM = 1536


class RagDocument(Base):
    """AI 상담이 참고하는 원본 문서 단위 (DS1_PRICE~DS8_UGC)."""

    __tablename__ = "rag_documents"
    __table_args__ = (
        CheckConstraint(
            "source_tier IN ('OFFICIAL','NEWS','INDUSTRY','CONSENSUS')",
            name="ck_rag_documents_source_tier",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    dataset_code: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    source_tier: Mapped[str] = mapped_column(Text, nullable=False)
    source_org: Mapped[str | None] = mapped_column(Text)
    source_url: Mapped[str | None] = mapped_column(Text)
    published_at: Mapped[datetime | None] = mapped_column(Date)
    license_note: Mapped[str | None] = mapped_column(Text)
    category_codes: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class RagChunk(Base):
    """검색 가능한 조각 + 임베딩. 하이브리드 검색(벡터 ivfflat + tsvector GIN)의 실제 대상."""

    __tablename__ = "rag_chunks"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("rag_documents.id", ondelete="CASCADE"), nullable=False
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    token_count: Mapped[int | None] = mapped_column(Integer)
    category_code: Mapped[str | None] = mapped_column(Text, index=True)
    item_type: Mapped[str | None] = mapped_column(Text)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(EMBEDDING_DIM))
    tsv: Mapped[str] = mapped_column(
        TSVECTOR, Computed("to_tsvector('simple', content)", persisted=True)
    )
