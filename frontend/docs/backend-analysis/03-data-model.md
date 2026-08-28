# 03 · 데이터 모델 · 마이그레이션

> 코드 기준 `backend` **`6c29ea0`** (2026-08-24 3차 재분석) · `app/models/` 10모듈(+`__init__.py`) + `alembic/versions/` **13개** 전수(`4de56b422020` 신설 — §5).
> 🔍 **4차 점검(2026-08-25)** — 코드 6c29ea0 대비 팩트체크. 수정 5건 / 미검증 2건. 상세는 README 「4차 점검 이력」.
> 🆕 **3차 재분석 (`e3496e7` → `6c29ea0`, PR #57 4커밋).** 이 문서의 내용은 **바뀌지 않았다** — 바뀐 파일이 `app/personalization/prompts.py` 와 그 테스트뿐이라 라우터·스키마·모델·마이그레이션 diff 가 **0** 이다(실측). 수치도 재측정에서 동일하다(엔드포인트 **35**·OpenAPI 노출 **33** · 마이그레이션 **13** · 스키마 **15**파일 · 모델 **10**개 · 카테고리 **9**). 무엇이 바뀌었는지는 [`04` §5.6-c](04-ai-chat-rag.md).
> ⚠️ **`6c29ea0` 는 「코드」기준이지 배포본이 아니다.** 배포본(staging)은 **`b4615af`** 로 이보다 **한참 이전**이고 `origin/backend` 대비 **37커밋 뒤**다 — [`08` §1](08-cluster-runtime.md). 「코드에 있다」와 「호출된다」를 따로 센다.
> **프론트가 이 문서를 읽는 이유** — "이 데이터가 실제로 어떻게 저장되고 **무엇이 보장되는가**".
> API 스키마가 말하지 않는 제약과 드리프트가 여기 있다.

## 0. 먼저 사실 정정 2건 [실측]

- 마이그레이션은 **13개**다(`alembic/versions/` 의 `.py` 실측, `6c29ea0` 재측정).
  ⚠️ 이 줄은 원래 「13개가 아니라 12개」였다 — `df4a8ff` 시점 실측이 12였고, 그 뒤 `4de56b422020`
  (`chat_messages.user_rating`)이 추가돼 **지금은 정말로 13개**다.
- 테이블은 **14개가 아니라 15개**다. v4.0 에서 5개 추가·4개 영구 삭제.
  `app/models/__init__.py:1` 의 "15개 테이블" 이 맞다.

---

## 1. DB 스택 (`app/core/db.py`)

| 항목 | 값 |
|---|---|
| DBMS | **PostgreSQL** (Azure Database for PostgreSQL Flexible Server) |
| 드라이버 | **asyncpg** (`postgresql+asyncpg://`) — DSN 이 `postgresql://` 면 자동 변환 |
| ORM | SQLAlchemy 2.0 async |
| 세션 | 전역 싱글턴 엔진 + `async_sessionmaker(expire_on_commit=False)`, 요청마다 세션 1개 |
| 커밋 | ⚠️ `get_session()` 은 **commit/rollback 을 하지 않는다** — 서비스가 직접 커밋, 안 하면 롤백 |
| SSL | `?sslmode=` 를 제거하고 `connect_args={"ssl":"require"}` 로 전달(asyncpg 가 모름) |
| 인증 | `DATABASE_AUTH_MODE=aad` 면 커넥션마다 Entra ID 토큰 주입(1시간 만료 대응) |
| 확장 | **pgvector**. ⚠️ **pgcrypto 는 의도적으로 안 쓴다** — `gen_random_uuid()` 는 PG13+ core 내장이고 Azure 허용목록에 pgcrypto 가 없어 실제로 막힌다 |

---

## 2. ENUM 타입 — DB 레벨은 **딱 하나**

### `category_code` (PostgreSQL ENUM) — 9값, 순서 그대로

```
MEETING, VENUE, SDM, GIFT, HOMEWARE, INVITATION, HONEYMOON, HOMENEW, ETC
```

사용: `wedding_categories`(NOT NULL) · `checklist_items`(NOT NULL) · `timeline_items`(**NULL 허용**) ·
`payments`(NOT NULL) · `chat_sessions`(**NULL 허용**).

**ENUM 을 안 쓰는 예외 2개** — `price_benchmarks.category_code` 는 ENUM 에 없는 특수값 **`'TOTAL'`** 이
필요해서, `vendor_case_examples.category_code` 는 ENUM 재설계와 독립시키려고 **`TEXT + CHECK`** 다.

🚨 **나머지 상태값은 전부 `TEXT + CHECK` 다.** `status`·`origin`·`item_type`·`role`·`payment_type` 모두
DB ENUM 이 아니다.

### 카테고리 표시명은 DB 에 없다

v3 의 `categories` 테이블은 **삭제**됐고, 이름·티어·기능플래그는 백엔드 상수
`app/core/categories.py:32-42` 가 **단일 출처**다:

| code | name_ko | order | tier | has_cost | has_benchmark | has_vendor_cases |
|---|---|---|---|---|---|---|
| MEETING | 상견례 | 0 | MOCKUP | ✗ | ✗ | ✗ |
| VENUE | 예식장 | 1 | **FOCUS** | ✓ | ✓ | ✓ |
| SDM | 스드메(드레스샵투어 포함) | 2 | **FOCUS** | ✓ | ✓ | ✓ |
| GIFT | 예물·예단 | 3 | MOCKUP | ✓ | ✗ | ✗ |
| HOMEWARE | 혼수 | 4 | MOCKUP | ✓ | ✗ | ✗ |
| INVITATION | 청첩장·답례품 | 5 | MOCKUP | ✓ | ✗ | ✗ |
| HONEYMOON | 신혼여행 | 6 | MOCKUP | ✓ | ✗ | ✗ |
| HOMENEW | 신혼집 구하기 | 7 | MOCKUP | ✓ | ✗ | ✗ |
| ETC | 기타 | 8 | MOCKUP | ✓ | ✗ | ✗ (`allows_custom_tag=True`) |

---

## 3. 관계도 — `weddings` 루트 소유 트리

```
users (id UUID)
  │ 1:1  owner_user_id UNIQUE · ON DELETE CASCADE
  ▼
weddings (id UUID)  ← 프론트가 다루는 모든 데이터의 루트
  ├── wedding_categories   UNIQUE(wedding_id, category_code) → 웨딩당 최대 9행
  ├── ai_invocations
  │      ▲ generated_by_run_id (nullable)
  │      ├──── checklist_items
  │      └──── timeline_items
  ├── checklist_items
  ├── timeline_items
  ├── payments
  ├── chat_sessions
  │     └── chat_messages
  └── feedback_reports
         ├── resolved_by → users(id)  (nullable)
         └── target_id   → FK 아님 (다형 참조)

auth_sessions → users(id) CASCADE        ← weddings 트리 밖

── weddings 와 무관한 전역 테이블 (wedding_id 컬럼 자체가 없음) ──
price_benchmarks · vendor_case_examples
rag_documents └── rag_chunks
```

### 보장되는 것 / 안 되는 것

- ✅ **사용자 1명 = 웨딩 정확히 1개** (`owner_user_id UNIQUE`). v3 의 "시드된 단일 행" 가정은 **폐기**.
- ✅ `users` 삭제 → `weddings` → 하위 전부 CASCADE.
- ❌ **`feedback_reports.target_id` 는 FK 가 아니다** — `target_type` 에 따라 대상 테이블이 달라지는
  다형 참조라 **DB 가 존재를 보장하지 않는다.** 검증은 서비스가 한다.
- ❌ **`SUM(planned_budget) <= total_budget` 를 DB 가 강제하지 않는다** — 서비스 코드 검증
  (`400 BUDGET_EXCEEDED`).
- ❌ **`checklist_items` 와 `timeline_items` 는 완전히 독립**이다. 체크했다고 타임라인이 바뀌지 않고
  그 반대도 없다.

---

## 4. 테이블 전수 (15개) — 프론트 관점 요약

> 타입/NULL/기본값은 **마이그레이션 DDL 기준**(= 실제 DB)이다.
> 전체 컬럼은 원본 마이그레이션 참조. 여기서는 **프론트 동작에 영향 있는 것**만 추린다.

### 4.1 `users`
`id UUID PK` · `email TEXT UNIQUE` · `password_hash TEXT NULL`(**NULL 이면 소셜 전용 계정**) ·
`auth_provider TEXT CHECK IN (GOOGLE, KAKAO, NAVER, APPLE)` · `auth_provider_id` ·
`display_name` · `profile_image_url` · `status TEXT DEFAULT 'ACTIVE' CHECK IN (ACTIVE, SUSPENDED, DELETED)` ·
`is_admin BOOLEAN DEFAULT false` · `last_login_at` · `created_at`/`updated_at TIMESTAMPTZ DEFAULT now()`

제약: `CHECK ((auth_provider IS NULL) = (auth_provider_id IS NULL))` · `UNIQUE(auth_provider, auth_provider_id)`

> ⚠️ **DB CHECK 에는 `KAKAO`·`APPLE` 이 있지만 코드 구현은 `GOOGLE`·`NAVER` 2개뿐이다**
> (배포본 실측: kakao → 404).

### 4.2 `auth_sessions`
`id UUID PK` · `user_id → users CASCADE` · **`session_token_hash TEXT UNIQUE`**(SHA-256 해시만, 원문 없음) ·
`login_method CHECK IN (LOCAL, GOOGLE, KAKAO, NAVER, APPLE)` · `issued_at` · **`expires_at`** ·
`revoked_at` · `user_agent` · `ip_address TEXT`

**BFF + Opaque 쿠키** 방식 → [05](05-auth-cors-deploy.md) §1

### 4.3 `weddings`
| 컬럼 | 타입 | NULL | 비고 |
|---|---|---|---|
| `owner_user_id` | UUID | NO | **UNIQUE** |
| `user_role` | TEXT | NO | CHECK `BRIDE, GROOM` |
| **`wedding_date`** | **DATE** | **NO** | 🚨 `precision='NO_PLAN'` 이어도 **NOT NULL** — placeholder 가 반드시 들어간다 |
| `wedding_date_precision` | TEXT | NO | DEFAULT `'EXACT'` · CHECK 5값 |
| **`total_budget`** | **BIGINT** | **NO** | CHECK `> 0` |
| `total_budget_unsure` | BOOLEAN | NO | DEFAULT false |
| `guest_count_unsure` | BOOLEAN | NO | DEFAULT false (`63c0e2ae03d4:96`) |
| `region_code` | TEXT | NO | ⚠️ **CHECK 없음 — 자유 텍스트** |
| `guest_count` | INTEGER | YES | |
| `taste_preference`/`venue_priority`/`sdm_priority` | TEXT | YES | 각 CHECK |
| `primary_goals` | **TEXT[]** | YES | |
| `priorities` | **JSONB** | YES | 구조 미강제 |
| **`done_so_far`** | **JSONB** | YES | 🚨 **현재 아무도 안 채운다**(TODO) |

> 🔑 `wedding_date`·`total_budget` 이 **DB 에서 NOT NULL** 이라는 사실은
> [02](02-schemas.md) §3 의 `WeddingOut` non-null 우려를 **완화한다** — 다만 어떤 placeholder 가
> 들어가는지는 **실측 확인 필요**.

### 4.4 `wedding_categories`
`id UUID PK` · `wedding_id` · `category_code ENUM` · `is_active BOOLEAN DEFAULT true` ·
`planned_budget BIGINT DEFAULT 0 CHECK >= 0` · `selected_options TEXT[]` · `skip_reason` ·
`display_order SMALLINT` · `updated_at`
제약: **`UNIQUE(wedding_id, category_code)`** · ⚠️ **`created_at` 없음**

### 4.5 `ai_invocations`
`id UUID PK` · `wedding_id` · `trigger CHECK IN (ONBOARDING_INITIAL, FIELD_UPDATED, MANUAL_REGENERATE)` ·
`changed_fields TEXT[]` · `affected_domains TEXT[]` · **`status CHECK IN (SUCCESS, FAILED, BLOCKED)`** ·
`error_message`(⚠️ **API 응답에 안 실린다**) · `trace_ref`(Langfuse) · `created_at`

### 4.6 `checklist_items` — 🚨 **v3 와 이름만 같고 완전히 다른 테이블**
`id **UUID** PK`(v3 은 BIGSERIAL) · `wedding_id NOT NULL`(v3 은 전역 마스터) · `category_code ENUM NOT NULL` ·
`generated_by_run_id → ai_invocations` · `origin CHECK (LLM, USER)` · **`status`** ·
`item_type CHECK (CONTRACT_TERM, EXTRA_COST, PREP)` · `option_group` · `group_label NOT NULL` ·
`title NOT NULL` · `body NULL`(v3 은 NOT NULL) ·
**`priority TEXT DEFAULT 'mid' CHECK IN (high, mid, low)`** ⚠️ **소문자** ·
**`source_tier CHECK IN (OFFICIAL, CONSENSUS, INDUSTRY)`** ⚠️ **`NEWS` 없음, nullable** ·
`source_label`/`source_url`/`tag`/`memo` · **`user_edited_at`** · `display_order` · `created_at`/`updated_at`

#### 🚨 핵심 복합 CHECK — 프론트 상태 UI 가 반드시 알아야 한다

```sql
(category_code =  'HOMEWARE' AND status IN ('LISTED','COMPARING','ORDERED','DELIVERED'))
OR
(category_code <> 'HOMEWARE' AND status IN ('TODO','DOING','SKIP','DONE'))
```

**HOMEWARE(혼수)만 4단계 상태값이 다르다.** DB CHECK 와 서비스 검증이 이중으로 막는다.

### 4.7 `timeline_items`
`id UUID PK` · `wedding_id` · **`category_code ENUM NULL`**(카테고리 없는 항목 허용) ·
`generated_by_run_id` · `origin` · **`status DEFAULT 'TODO' CHECK IN (TODO, DONE)`**(2값뿐) ·
`title` · **`target_date DATE NOT NULL`** · **`default_dday_offset_days INTEGER`**(음수 = 결혼식 전) ·
`date_overridden BOOLEAN DEFAULT false` · **`user_edited_at`** · `display_order` · `created_at`/`updated_at`

⚠️ **`phase_label` 컬럼이 없다** — 프론트가 `default_dday_offset_days` 로 계산.
⚠️ **`is_overdue` 컬럼도 없다** — 서버가 조회 시점에 계산해 응답에만 싣는다.

### 4.8 `payments`
`id UUID PK` · `wedding_id` · `category_code ENUM` · `item_name` ·
`payment_type CHECK (DEPOSIT, INTERIM, BALANCE, ETC)` · `vendor_name`/`contact_name`/`contact_phone` ·
**`amount BIGINT CHECK > 0`** · `due_date DATE` · `paid_date DATE` ·
`status DEFAULT 'PLANNED' CHECK (PLANNED, PAID, CANCELED)` · `receipt_url` · `memo`

🚨 **`created_at`·`updated_at` 이 없다.** v3 에는 있었는데 v4 재생성에서 빠졌다.
→ **결제 항목을 등록 시각순으로 정렬할 수 없다.** 정렬 축은 `due_date`/`paid_date` 뿐이다.

지출과 납부예정은 별도 테이블이 아니라 **`status` 로만 구분**한다.

### 4.9 `chat_sessions`
`id UUID PK` · `wedding_id` · `category_code ENUM NULL` ·
**`title TEXT NULL`** ⚠️ **항상 NULL(채우는 코드가 없다)** ·
**`last_message_at TIMESTAMPTZ NULL`** ⚠️ **항상 NULL** · `created_at`

→ **상담 이력 목록 화면을 만들려면 백엔드 작업이 선행돼야 한다.**

### 4.10 `chat_messages`
`id UUID PK` · `session_id` · **`role CHECK IN (user, assistant)`** ⚠️ **소문자** · `content` ·
**`citations JSONB`** · **`verification JSONB`** · `latency_ms` · `trace_ref` ·
🆕 **`user_rating TEXT NULL CHECK IN ('GOOD','BAD')`** · `created_at`

`citations` 가 청크를 FK 로 걸지 않고 **통째로 스냅샷**하는 것은 의도적 설계다 —
재색인해도 과거 답변의 출처가 안 깨진다.

🆕 **`user_rating` (2026-08-24, `4de56b422020`)** — 👍👎 평가. **NULL 허용 = 미평가**이고
재평가하면 덮어쓴다(마지막 값이 최종). **`feedback_reports` 와 목적이 달라 재사용하지 않고
별도 컬럼으로 뒀다**는 것이 마이그레이션 주석에 명시돼 있다 — 전자는 신고(사유 CHECK +
모더레이션 워크플로), 후자는 단순 평가다. **DB 가 SSOT** 이고 Langfuse Score 는 부수 전송이다
(`trace_ref` 가 없는 행도 있으므로). 🚨 **아직 배포되지 않았다** — 배포본 응답에 필드가 없다.

> ✅ **「CHECK 가 있는데 NULL 이 되나」를 공식 문서로 확인했다.** 마이그레이션은 `NOT NULL` 없이
> `CHECK (user_rating IN ('GOOD','BAD'))` 만 건다. PostgreSQL 공식 문서:
> *"a check constraint is satisfied if the check expression evaluates to **true or the null value**.
> Since most expressions will evaluate to the null value if any operand is null, they will not prevent
> null values in the constrained columns."*
> — [PostgreSQL 18 §5.5.1 Check Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)
> → `NULL IN (...)` 은 NULL 로 평가되므로 **CHECK 를 통과한다. 「미평가」 상태가 실제로 존재한다.**

### 4.11 `feedback_reports`
`id UUID PK` · `wedding_id` · `target_type CHECK (CHAT_MESSAGE, CHECKLIST_ITEM, TIMELINE_ITEM)` ·
**`target_id UUID` — FK 아님(다형 참조)** ·
**`reason_category CHECK IN ('부정확함','부적절함','도움안됨','편향/차별적','기타')`** 🚨 **한국어 리터럴** ·
`comment` · `status DEFAULT 'OPEN' CHECK (OPEN, REVIEWED, RESOLVED)` · `resolved_at` · `resolved_by → users`

`'편향/차별적'` 은 **슬래시 포함 문자 그대로** — 정규화하지 않기로 명시적 결정.

### 4.12 `price_benchmarks` (전역)
**`id BIGSERIAL PK`** · `survey_month DATE` · `region_code TEXT`(**CHECK 없음**) ·
**`category_code TEXT CHECK IN (9개 + 'TOTAL')`** · `item_code TEXT DEFAULT 'TOTAL'` ·
`median_price BIGINT` · `min_price`/`max_price BIGINT NULL` · `sample_count INTEGER NULL` ·
`source_url NOT NULL` · `source_note`
제약: `UNIQUE(survey_month, region_code, category_code, item_code)`. **`wedding_id` 없음.**

### 4.13 `vendor_case_examples` (전역)
**`id BIGSERIAL PK`** · **`category_code TEXT CHECK IN (VENUE, SDM)` 2값만** ·
`case_type CHECK (GOOD, BAD)` · `case_label` · `situation` · `key_lesson` · `related_item_type` ·
**`source_tier CHECK IN (OFFICIAL, NEWS, INDUSTRY, CONSENSUS)` 4값**(⚠️ checklist 는 3값) ·
`source_note` · `display_order` · `created_at`

**익명 합성 사례만** 담는다 — 실명·주소·연락처 금지.

### 4.14 `rag_documents` / 4.15 `rag_chunks`
- `rag_documents` — `id BIGSERIAL` · `dataset_code`(DS1_PRICE~DS8_UGC) · `title` · `source_tier` ·
  `source_org`/`source_url`/`license_note` · `published_at DATE` · `category_codes TEXT[]`
- `rag_chunks` — `id BIGSERIAL` · `document_id` · `chunk_index` · `content` · `token_count` ·
  **`category_codes TEXT[]`**(한 조각이 여러 카테고리에 걸칠 수 있다) · `item_type` · `source_url` ·
  **`embedding VECTOR(1536)`** ·
  **`tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED`** — 쓰기 불가

인덱스 3개: ivfflat(vector_cosine_ops, lists=100) · GIN(tsv) · **GIN(category_codes)**.

---

## 5. 🚨 `updated_at` 은 **갱신되지 않는다** [실측]

`updated_at` 을 가진 테이블은 5개(`users`, `weddings`, `wedding_categories`, `checklist_items`,
`timeline_items`)지만:

- 마이그레이션 전체에 **트리거/함수 0건**
- 모델에 **`onupdate=` 0건**
- 서비스 코드에 `updated_at` 대입 **0건**

→ **INSERT 때 `now()` 로 한 번 찍히고 그 뒤로 절대 안 변한다.**

그런데 `PATCH /checklist-items/{id}` 응답(`ChecklistItemPatchOut`)이 **이 값을 실어 보낸다.**

🚨 **프론트는 `updated_at` 을 "마지막 수정 시각"으로 표시하면 안 된다.**
실제 수정 시각은 **`checklist_items.user_edited_at` / `timeline_items.user_edited_at`**
(사용자가 고쳤을 때만 채워짐)이다 — 다만 이 둘은 **현재 API 응답에 없다.**

---

## 6. 금액·날짜의 실제 SQL 타입

### 금액 — **NUMERIC 은 한 곳도 없다. 전부 `BIGINT`(정수)**

`weddings.total_budget` · `wedding_categories.planned_budget` · `payments.amount` ·
`price_benchmarks.median_price`/`min_price`/`max_price`

→ **원 단위 정수, 소수점이 존재할 수 없다.** JS `Number`(2^53) 범위 안이라 안전하다.
`guest_count`·`sample_count`·`latency_ms`·`default_dday_offset_days` 는 `INTEGER`,
`display_order` 는 `SMALLINT`.

### 날짜 — 두 종류가 명확히 갈린다

| 타입 | 의미 | 컬럼 |
|---|---|---|
| **`DATE`** (타임존·시각 없음) | 사용자가 고르는 "달력의 날" | `weddings.wedding_date` · `timeline_items.target_date` · `payments.due_date`/`paid_date` · `price_benchmarks.survey_month` · `rag_documents.published_at` |
| **`TIMESTAMPTZ`** (UTC 저장) | 시스템이 찍는 시각 | 모든 `created_at`/`updated_at` · `auth_sessions.issued_at`/`expires_at`/`revoked_at` · `*.user_edited_at` · `chat_sessions.last_message_at` · `feedback_reports.resolved_at` |

**타임존 없는 `TIMESTAMP` 는 스키마에 하나도 없다.**

> ⚠️ 재발방지 — DDL 은 전부 TIMESTAMPTZ 지만 **모델 쪽은 아직 통일돼 있지 않다.** `app/models/user.py:3-9` 가 기록한 버그(모델이 `DateTime(timezone=True)` 를 빠뜨리면 SQLAlchemy 가 `TIMESTAMP WITHOUT TIME ZONE` 으로 캐스팅해 asyncpg 가 tz-aware 값 바인딩을 거부)는 `users`/`auth_sessions`/`checklist_items`/`timeline_items`/`ai_invocations`/`chat_*`/`feedback_reports` 에서만 고쳐졌고, `app/models/wedding.py:102-103,133` · `benchmark.py:90` · `rag.py:54` 의 `created_at`/`updated_at` 은 여전히 타입 지정 없는 `mapped_column(server_default=func.now())` 다. 지금은 서버 기본값만 쓰고 파이썬에서 값을 바인딩하지 않아 잠복 상태 — 이 컬럼들에 `datetime.now(UTC)` 를 대입하는 코드를 추가하면 같은 에러가 재발한다.

---

## 7. 마이그레이션 히스토리 (**13개**, `down_revision` 체인 순서)

| # | 리비전 | 요약 |
|---|---|---|
| 1 | `66e6da86e72e` | **초기 v3.0 스키마 14테이블** + `CREATE EXTENSION vector` |
| 2 | `7e1bfc107dc7` | `categories` 에 **7개** 시드(`HOMENEW`·`ETC` 없음) |
| 3 | `2a23250a6ef0` | `weddings` 에 개인화 5컬럼 추가 |
| 4 | `614830d99cd2` | RAG 2테이블 DROP 후 재생성 — `category_code` → **`category_codes TEXT[]`**(GIN) + `rag_chunks.source_url` 신설 |
| 5 | `7713273146d1` | 🔻 **v3→v4 전환점.** RAG 2개만 남기고 **12테이블 전부 DROP CASCADE** |
| 6 | `9acc4aa37be1` | `price_benchmarks` 재생성 — CHECK 2값 → **9카테고리+`TOTAL`** |
| 7 | `576130d068f7` | `vendor_case_examples` 재생성 — `category_id FK` → `category_code TEXT` |
| 8 | `63c0e2ae03d4` | 🆕 **인증 재도입.** `CREATE TYPE category_code AS ENUM (9값)` + `users`·`auth_sessions` 신설 + `weddings`(`owner_user_id UNIQUE`)·`wedding_categories` 재생성 |
| 9 | `9fbddcf98efe` | `ai_invocations` 신규 + `checklist_items` 전면 재설계 + `timeline_items` 신규 |
| 10 | `eac99fa785c5` | `payments` 재생성 — **`created_at`/`updated_at` 제거**, `contact_name`/`contact_phone`/`receipt_url` 추가 |
| 11 | `be2aad3d6908` | `chat_sessions`·`chat_messages` 재생성 — `last_message_at`·`trace_ref` 추가 |
| 12 | `ef62d360e9fb` | 🆕 **`feedback_reports` 완전 신규**(v3 에도 없던 테이블) |
| 13 | `4de56b422020` | 🆕 **`chat_messages.user_rating`** TEXT + CHECK(`GOOD`/`BAD`) ← **HEAD** (2026-08-24, PR #55) |

### v3 → v4 에서 정확히 무슨 일이 벌어졌나

**DROP 된 12테이블** — `chat_messages, chat_sessions, vendor_case_examples, price_benchmarks,
user_milestones, milestone_templates, payments, checklist_progress, checklist_items,
wedding_categories, categories, weddings`

**살아남은 것: `rag_documents`, `rag_chunks` 2개뿐** — Azure OpenAI 임베딩 비용이 들어간
실데이터(8문서/140청크)라 보존.

**❌ 영구 삭제 — 다시 만들어지지 않은 4테이블**

| 삭제됨 | 대체 |
|---|---|
| `categories` | **DB 테이블이 아니라 백엔드 상수** `app/core/categories.py` + `category_code` ENUM |
| `checklist_progress` | `checklist_items` 에 흡수(마스터/진행 2테이블 → 웨딩별 1테이블) |
| `milestone_templates` | 백엔드 시드 상수 `app/core/timeline_catalog.py` |
| `user_milestones` | `timeline_items` |

**🆕 신규 5테이블** — `users`, `auth_sessions`, `ai_invocations`, `timeline_items`, `feedback_reports`

**카테고리 코드도 7 → 9로 늘었다** — `HOMENEW`(신혼집 구하기), `ETC`(기타) 추가.

---

## 8. 프론트가 알아야 할 드리프트·함정 [실측]

1. 🚨 **`payments` 에 타임스탬프가 없다** — 등록순 정렬 불가(§4.8)
2. 🚨 **`updated_at` 은 절대 갱신되지 않는다** — API 로 내려오지만 값은 생성 시각(§5)
3. 🚨 **`chat_sessions.title`·`last_message_at` 은 항상 NULL** — 상담 이력 목록 화면은 백엔드 선행 필요(§4.9)
4. 🚨 **`weddings.done_so_far` 는 항상 NULL** — 온보딩의 "지금까지 진행한 것"은 저장되지 않는다
5. 🚨 **`checklist_items.status` 는 카테고리별로 값 집합이 다르다** — HOMEWARE 만 4단계 다름(§4.6)
6. 🚨 **`feedback_reports.reason_category` 는 한국어 리터럴** — 슬래시 포함 그대로(§4.11)
7. ⚠️ **`priority`(`high/mid/low`)와 `role`(`user/assistant`)만 소문자**다 — 다른 CHECK 값은 전부 대문자.
   대소문자를 섞으면 DB CHECK 에서 거부된다
8. ⚠️ **모델의 인덱스·제약 선언은 실제 DB 와 다르다** — 모든 마이그레이션이 `op.execute` 로 손으로
   쓰였으므로 **DDL 이 진실이고 모델의 `index=True` 는 장식이다.** 제약 이름도 Postgres 자동 명명
   (`users_status_check` 등)이라 **모델의 `ck_users_status` 같은 이름으로 에러를 파싱하면 안 맞는다**.
   유일한 예외는 `4de56b422020` 이 `ALTER TABLE ... ADD CONSTRAINT ck_chat_messages_user_rating` 로 명시한 것 하나뿐(모델 이름과 일치)
9. ⚠️ **`source_tier` 값 집합이 테이블마다 다르다** — `checklist_items` 는 **3값**(`NEWS` 없음),
   `vendor_case_examples`·`rag_documents` 는 **4값**. 공용 타입으로 합치면 틀린다
