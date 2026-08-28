# seed

콘텐츠성 시드 데이터(04_DB_spec.md §8): `checklist_items`(~85), `milestone_templates`(~55),
`vendor_case_examples`(4~12), `price_benchmarks`(14지역×6항목). `categories` 7행은 여기 없음 —
스키마와 함께 커밋되는 고정 데이터라 `backend/alembic/versions/`에 별도 마이그레이션으로 있다
(04_DB_spec.md §8 "Alembic은 2개로 끝낸다").

`alembic upgrade head` 적용 후 `cd backend && uv run python scripts/seed.py`로 삽입한다
(SQLAlchemy 모델 필요 — backend venv에서 실행). 아직 미작성.
