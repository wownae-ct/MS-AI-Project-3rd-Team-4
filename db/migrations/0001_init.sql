-- 초기 스키마. 브리프코치_DB_설계서_ERD.md §A-2 기준. ORM 없음 — 이 파일이 스키마의 유일한 출처.
-- 적용: python db/migrate.py (db/migrate.py가 이미 적용된 파일을 schema_migrations에 기록해 재적용 방지)

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE user_profile (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email TEXT NOT NULL,
    display_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE question (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL CHECK (category IN ('tech_interview', 'customer_explain', 'incident_report')),
    prompt_text TEXT NOT NULL,
    time_limit_sec INT NOT NULL DEFAULT 90 CHECK (time_limit_sec > 0),
    is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE practice_session (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT NOT NULL REFERENCES user_profile (id),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed'))
);

CREATE TABLE answer (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES practice_session (id),
    question_id TEXT NOT NULL REFERENCES question (id),
    audio_blob_url TEXT NOT NULL,
    transcript_text TEXT,
    duration_sec NUMERIC,
    status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'done', 'failed'))
);

CREATE INDEX idx_answer_session ON answer (session_id);

CREATE TABLE answer_metric (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    answer_id BIGINT NOT NULL UNIQUE REFERENCES answer (id),
    filler_word_count INT NOT NULL DEFAULT 0,
    wpm NUMERIC,
    sentence_count INT,
    silence_ms INT,
    raw_metrics JSONB
);

CREATE TABLE coach_feedback (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    answer_id BIGINT NOT NULL UNIQUE REFERENCES answer (id),
    structure_score JSONB NOT NULL,
    feedback_text TEXT NOT NULL,
    rewrite_example TEXT
);

CREATE TABLE guardrail_check (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    feedback_id BIGINT NOT NULL REFERENCES coach_feedback (id),
    verdict TEXT NOT NULL CHECK (verdict IN ('pass', 'retry', 'degraded')),
    retry_count INT NOT NULL DEFAULT 0,
    citation_chunk_ids JSONB
);

CREATE TABLE speech_guide_doc (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title TEXT NOT NULL,
    source_url TEXT,
    body_text TEXT NOT NULL
);

CREATE TABLE speech_guide_chunk (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    doc_id BIGINT NOT NULL REFERENCES speech_guide_doc (id),
    chunk_index INT NOT NULL,
    chunk_text TEXT NOT NULL,
    embedding vector(1536),
    token_count INT
);

-- 브리프코치_RAG_설계서.md §4 — pgvector HNSW, 단일 임베딩 검색 경로.
CREATE INDEX idx_speech_guide_chunk_embedding ON speech_guide_chunk USING hnsw (embedding vector_cosine_ops);

CREATE TABLE session_report (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES user_profile (id),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    summary_text TEXT NOT NULL,
    trend_json JSONB NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE agent_trace (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    answer_id BIGINT NOT NULL REFERENCES answer (id),
    agent_name TEXT NOT NULL CHECK (agent_name IN ('coach', 'verify')),
    duration_ms INT NOT NULL,
    tokens_in INT,
    tokens_out INT
);
