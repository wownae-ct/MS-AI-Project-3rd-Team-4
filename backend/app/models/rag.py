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
    DateTime,
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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


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


class RagIndexState(Base):
    """rag-reindex CronJob(매일 03시)의 스킵 가드용 단일 행 상태 테이블. 마지막으로 실제
    반영된 코퍼스의 해시(app/rag/corpus.py::compute_corpus_hash)를 저장해두고, 다음 실행이
    시작할 때 지금 코퍼스 해시와 비교한다 — 코퍼스 JSON이 그날 안 바뀌었으면 임베딩 API
    호출과 rag_documents/rag_chunks 전체 재구성을 건너뛴다(app/rag/indexing.py::reindex).
    스케줄(매일 03시) 자체는 그대로 두고, "할 일이 없는데도 돌리는 실행"만 없앤다.

    id를 1로 고정하는 CHECK로 항상 한 행만 존재하게 강제한다 — 하루 한 번, 몇 분 안에 끝나는
    배치라 두 실행이 실제로 겹칠 가능성은 거의 없고(concurrencyPolicy는 K8s 기본값인 Allow라
    이론적으로는 겹칠 수 있음), 설령 겹쳐도 이 테이블은 매 실행이 자기 결과로 덮어쓰는
    단일행이라 최악의 경우 마지막으로 커밋된 실행의 값만 남는다(레이스가 나도 스킵 여부
    판단이 다음 실행에서 또 재확인되므로 데이터 정합성엔 영향 없음)."""

    __tablename__ = "rag_index_state"
    __table_args__ = (CheckConstraint("id = 1", name="ck_rag_index_state_singleton"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    corpus_hash: Mapped[str] = mapped_column(Text, nullable=False)
    document_count: Mapped[int] = mapped_column(Integer, nullable=False)
    chunk_count: Mapped[int] = mapped_column(Integer, nullable=False)
    indexed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
