"""rag_documents / rag_chunks — 04_DB_spec.md §4-(11)(12), §7 DDL.

embedding은 pgvector Vector(1536), tsv는 Postgres GENERATED STORED 컬럼(Computed).
Importer: app/models/__init__.py.

2026-08-21: rag_chunks.category_code(TEXT, 단일값)를 category_codes(TEXT[], 배열)로 변경했다.
한 조각이 여러 카테고리에 걸치는 일반 자료(예: 정부 통계 보도자료 — 예식장·스드메 둘 다 다룸)를
표현하려고 조각을 복사해 여러 행으로 늘리는 대신, 라벨칸 자체에 여러 값을 담기로 결정
(대안: 행 복제 — 표 구조는 안 바꿔도 되지만 같은 임베딩을 여러 줄에 중복 저장해야 함)."""

from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    ARRAY,
    BigInteger,
    CheckConstraint,
    Computed,
    Date,
    ForeignKey,
    Index,
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
    """검색 가능한 조각 + 임베딩. 하이브리드 검색(벡터 HNSW + tsvector GIN)의 실제 대상."""

    __tablename__ = "rag_chunks"
    __table_args__ = (
        # 배열 컬럼은 btree가 아니라 GIN이어야 `category_codes @> ARRAY[:code]`(포함 여부) 질의를
        # 인덱스로 처리할 수 있다(retrieval.py가 카테고리 하드 필터로 이 조건을 쓴다).
        Index("idx_rag_chunks_category_codes", "category_codes", postgresql_using="gin"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("rag_documents.id", ondelete="CASCADE"), nullable=False
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    token_count: Mapped[int | None] = mapped_column(Integer)
    category_codes: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    item_type: Mapped[str | None] = mapped_column(Text)
    source_url: Mapped[str | None] = mapped_column(Text)
    # content를 "의미 좌표"로 바꾼 숫자 1536개 — retrieval.py의 벡터 검색이 여기서 거리를 잰다.
    embedding: Mapped[list[float] | None] = mapped_column(Vector(EMBEDDING_DIM))
    # content에서 자동으로 만들어지는 "검색용 단어 색인" — 직접 값을 넣는 게 아니라 Postgres가
    # INSERT/UPDATE 때마다 content를 보고 알아서 채운다(Computed). retrieval.py의 단어 검색이 씀.
    tsv: Mapped[str] = mapped_column(
        TSVECTOR, Computed("to_tsvector('simple', content)", persisted=True)
    )
