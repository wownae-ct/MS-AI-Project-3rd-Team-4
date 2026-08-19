"""SQLAlchemy(async, asyncpg 드라이버) ORM 계층. 세션/엔진 설정 + models/ 하위 테이블 정의.
스키마는 마이그레이션 파일 없이 ORM 메타데이터로 직접 생성한다(Base.metadata.create_all)."""
