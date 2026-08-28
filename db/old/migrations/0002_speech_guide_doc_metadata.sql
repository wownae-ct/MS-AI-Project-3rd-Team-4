-- speech_guide_doc/chunk 메타데이터 보강. 브리프코치_RAG_설계서.md 기준 원본 스키마엔 없던 3가지:
--
-- category: [카테고리] 태그. 자유 형식 — 유효값 미확정, CHECK 없음. WHERE 필터엔 안 씀(단일
--   임베딩 검색 경로 원칙 유지) — 코퍼스 구성 감사·향후 tag_filter 대비용.
--
-- source_note: 코퍼스의 "출처: ..." 텍스트(URL 아님). source_url과 별개 — 근거검증(guardrail)
--   에이전트가 나중에 "이 청크의 근거가 뭐였는지" 추적할 유일한 경로라 유실되면 안 됨.
--
-- doc_number: 코퍼스 JSON의 DOC-NN 번호. 자연키로 삼아 재색인 시 진짜 upsert가 가능하게 함.

ALTER TABLE speech_guide_doc ADD COLUMN category TEXT;
ALTER TABLE speech_guide_doc ADD COLUMN source_note TEXT;
ALTER TABLE speech_guide_doc ADD COLUMN doc_number INT UNIQUE;

-- chunk도 (doc_id, chunk_index)를 자연키로 삼아 upsert 가능하게.
ALTER TABLE speech_guide_chunk ADD CONSTRAINT speech_guide_chunk_doc_chunk_idx_key UNIQUE (doc_id, chunk_index);
