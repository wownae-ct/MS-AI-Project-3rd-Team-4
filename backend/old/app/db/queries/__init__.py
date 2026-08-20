"""테이블별 순수 SQL 쿼리 함수. ORM 매핑 없이 asyncpg.Record를 직접 다룬다.
테이블: user_profile, question, practice_session, answer, answer_metric, coach_feedback,
guardrail_check, speech_guide_doc, speech_guide_chunk, session_report, agent_trace
(스키마는 db/migrations/0001_init.sql 참고, 쿼리 함수는 아직 미작성)."""
