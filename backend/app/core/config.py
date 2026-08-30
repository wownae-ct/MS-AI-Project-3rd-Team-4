"""애플리케이션 런타임 설정. backend/app/core/__init__.py의 하위 모듈 — 다른 모든 모듈이 값이
필요하면 여기 Settings를 통해서만 읽는다(값을 직접 os.environ에서 읽지 않는다)."""

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    # 로컬 개발: DSN에 비밀번호 포함(db/migrate.py와 동일). 클러스터: AAD(Managed Identity) —
    # 비밀번호 없는 DSN + 연결 시점에 토큰을 password로 전달(app/db/__init__.py).
    database_auth_mode: Literal["password", "aad"] = "password"

    azure_openai_endpoint: str
    # infra/bicep/modules/openai.bicep의 실제 배포 이름(모델명 아님) — 05_RAG_design.md는
    # "gpt-4o-mini"로 서술하지만 실제 배포된 모델은 gpt-5.4-mini(배포 이름 chat-mini)다. Azure
    # OpenAI 호출은 배포 이름으로 하므로 실제 모델이 바뀌어도 이 값만 안 바뀌면 코드는 그대로다.
    azure_openai_chat_deployment: str = "chat-mini"
    azure_openai_embedding_deployment: str = "embedding"
    # TODO(재확인): 구현 시점에 실제 배포된 리소스/openai 패키지 버전과 다시 맞춰볼 것
    # (원래 브리프코치_기술설계서.md §8 미결 항목 — 문서는 docs/old/brief/plan/에 아카이브,
    # 메리맵 기술설계서에서 같은 항목 재확인 필요).
    azure_openai_api_version: str = "2024-10-21"
    # 2026-08-26 챗 SSE 타임아웃 회귀 수정 — 이전엔 이 값이 없어 openai SDK 기본 타임아웃(600초)이
    # 그대로 적용됐다. 챗 그래프(app/rag/graph.py)의 verify/reformulate_query처럼 스트리밍 없이
    # 통으로 기다리는 호출이 오래 걸리면, 그 구간엔 SSE로 바이트가 하나도 안 나가서 nginx ingress의
    # proxy-read-timeout(기본 60초, infra/k8s/overlays/*/ingress.yaml)이 먼저 커넥션을 끊어버려
    # "타임아웃 에러"로 보였다. 45초로 못박아 이 구간이 무한정 열려있지 않게 하고(프론트가 이미
    # personalization 쪽에 쓰는 PERSONALIZATION_TIMEOUT_MS=45000과 같은 값으로 맞춤), verify/
    # reformulate_query 대기 중엔 별도로 SSE heartbeat도 흘려보내(app/rag/graph.py) 프록시가 그
    # 45초 안에서도 "죽은 연결"로 오인하지 않게 한다. get_azure_openai_client()가 만드는 클라이언트
    # 전부(임베딩·챗·개인화)가 이 값을 공유한다 — 인덱싱(짧은 텍스트 16개 배치)이나 개인화 생성
    # 호출도 45초 안에 끝나는 게 정상이라 별도 값을 둘 이유가 없다(YAGNI).
    azure_openai_timeout_seconds: float = 45.0

    # 05_RAG_design.md §4: 벡터 top-8 + tsvector top-4 → RRF 융합 → top-5 컨텍스트.
    rag_vector_top_k: int = 8
    rag_tsvector_top_k: int = 4
    rag_context_top_k: int = 5
    rag_rrf_k: int = 60
    # 검색 결과가 "질문과 아예 상관없는" 수준이면 generate/verify를 돌리지 않고 거절한다.
    # 값의 근거는 라이브 실측(2026-08-30) — rag_chunks 전체를 대상으로 한 top-1 코사인 유사도
    # 분포를 세 집단으로 나눠 재봤다:
    #   · 명백한 주제이탈 12건("스파게티 맛집", "오늘 날씨", "퀵소트 짜줘" 등) → 최대 0.343
    #   · 골든 질문 21건(scripts/run_rag_eval.py)                          → 최소 0.406
    #   · 실사용자 질문 95건(중복 제거, chat_messages)                      → 0.30 미만 17건 중
    #     13건이 무관 질문("눈누난나", 랜덤 타이핑, 프롬프트 인젝션 시도 등)
    # 0.35로 잡으면 주제이탈 12/12를 다 막지만 실제 정상 질문("드레스 상담 받기 전에 뭐 알아야해?"
    # 0.331, "웨딩업체 알아볼때 하는법" 0.311)까지 잘린다 — 서비스 본질을 훼손하므로 0.30을
    # 택했다. 0.30~0.35 사이로 새는 소수(예: "제주도 맛집" 0.310)는 기존 generate가 "확인된
    # 근거가 없습니다"로 거절하므로 방치가 아니다.
    #
    # 주의: 이 값은 **카테고리 필터를 적용하지 않은 전역 유사도**와 비교한다(retrieval.py의
    # _GLOBAL_TOP_SIMILARITY_SQL). "이게 결혼 질문이긴 한가"는 사용자가 어느 카테고리 탭에
    # 있든 같은 답이어야 하기 때문이다 — 실측상 세션 677개 중 593개(88%)가 category_code를
    # 걸고 들어오는데, 필터를 건 채로 재면 VENUE 탭에서 던진 정상 SDM 질문이 주제이탈로
    # 오판될 수 있다.
    rag_min_similarity: float = 0.30

    # 2026-08-31 — AI상담 프롬프트에 사용자 본인의 예산·일정·지출을 실을지
    # (app/rag/chat_profile.py). 끄면 프롬프트가 이 기능 도입 전과 바이트 단위로 같아지므로,
    # 데모 중 이상 동작이 보이면 코드 롤백 없이 env 하나로 즉시 되돌릴 수 있다. 기본값이 있어
    # 새 필수 env가 아니다(필수 필드를 늘렸다가 파드가 부팅에서 죽은 전례가 있어 의도적).
    chat_profile_enabled: bool = True

    # rag-reindex CronJob이 data/rag_corpus/를 이 경로에 마운트한다(infra/k8s/base/rag-cronjob/
    # cronjob.yaml: /app/data/rag_corpus, 컨테이너 WORKDIR이 /app이라 상대경로로 일치).
    rag_corpus_path: str = "data/rag_corpus"

    # BFF + Opaque 세션 쿠키(07_technical_design.md §1). 쿠키 이름은 00_BASELINE.md §4-1/
    # 07_technical_design.md §1이 "wr_session"이라 명시하는데, 03_API_spec.md 예시 3곳은
    # "session_id"로 돼 있다 — BASELINE이 SSOT("다른 문서는 이와 문자 그대로 일치")이므로
    # wr_session을 쓴다(03_API_spec.md 쪽 드리프트로 판단, 2026-08-24).
    session_cookie_name: str = "wr_session"
    session_ttl_days: int = 30

    # 소셜 로그인(구글/네이버, 00_BASELINE.md §0-2 Should) — BFF 패턴이라 client_secret은
    # 서버에만 있고 브라우저에는 절대 노출되지 않는다(§4-1). 다른 필수 시크릿(azure_openai_
    # endpoint 등)과 동일하게 기본값 없이 필수로 둔다 — CI는 backend-ci.yml에 더미값을 준다.
    google_client_id: str
    google_client_secret: str
    naver_client_id: str
    naver_client_secret: str
    # 이 백엔드 자신의 공개 base URL — OAuth redirect_uri(=IdP 콘솔에 등록해둔 콜백 주소)를
    # 조립하는 데 쓴다. 로컬은 uvicorn 기본 포트, staging/production은 실제 AKS Ingress 도메인
    # (03_API_spec.md §1의 base URL과 동일 호스트, /api/v1 제외 — 콜백 경로 조립 시 붙인다).
    oauth_backend_base_url: str = "http://localhost:8000"
    # 소셜 로그인 콜백 성공/실패 후 브라우저를 돌려보낼 프론트 오리진(SWA/로컬 dev 서버).
    frontend_base_url: str = "http://localhost:5173"

    # 14_langfuse_tracing_design.md — 기본 off(마스터 스위치). 켜져 있어도 두 키가 없으면
    # app/core/tracing.py::is_tracing_enabled()가 다시 막는다(오설정으로 매 요청 예외 방지).
    langfuse_enabled: bool = False
    langfuse_public_key: str | None = None
    langfuse_secret_key: str | None = None
    # Japan 리전 — 한국에서 EU(아일랜드)/US(오레곤)보다 지연시간 짧음(2026-04 출시).
    langfuse_host: str = "https://jp.cloud.langfuse.com"
    langfuse_environment: str = "local"

    # 영수증 OCR 자동채움(2026-08-25 결정, payments) — infra/bicep/modules/storage.bicep이
    # 배포 시점에 직접 써넣는 값(azure_openai_endpoint와 동일 패턴). 컨테이너 이름은 환경마다
    # 다를 이유가 없어 기본값만 두고 K8s env로 안 뺐다(rag_corpus_path와 동일 원칙).
    azure_storage_blob_endpoint: str
    azure_storage_receipts_container: str = "receipts"
    # 영수증 vision 추출에 쓸 배포 — 기본은 이미 chat 전반에 쓰는 azure_openai_chat_deployment
    # 값(현재 gpt-5.4-mini)을 그대로 재사용한다. 풀사이즈(gpt-5.4, 배포 이름 "chat")로 A/B
    # 테스트하고 싶으면 이 값만 바꾸면 된다 — infra/bicep/modules/openai.bicep에 두 배포
    # (chat-mini/chat) 모두 이미 있어 새 배포·RBAC 변경 없이 전환 가능.
    azure_openai_receipt_vision_deployment: str | None = None

    # AI상담(챗) 그래프 전용 배포 — 2026-08-29 A/B 비교(21개 골든 질문, docs/wedding/ing/
    # gpt54-vs-mini-comparison-2026-08-29.md) 결과로 gpt-5.4(배포 이름 "chat")를 실제 기본값으로
    # 전환했다: 검증 통과율은 개인화·영수증OCR이 쓰는 gpt-5.4-mini와 동일(21/21 SUPPORTED)했지만
    # gpt-5.4가 출처 경계를 더 엄격히 지키고 근거 자료를 더 폭넓게 활용했다(속도는 약 1.7배
    # 느림, 평균 8.7s vs 5.0s — 감내 가능하다고 판단). `reasoning_effort` 파라미터로 속도-품질을
    # 조절하는 대안은 검토 후 기각 — gpt-5.4/gpt-5.4-mini 둘 다 minimal 이상에서 추론 토큰이
    # 예산을 전부 먹어 답변이 빈 문자열로 나오는 경우가 잦았고(안전한 값은 사실상 minimal뿐이라
    # 조절 폭이 없음), 추론 토큰은 스트리밍되지 않아 사용자에게 응답 시작 전 수십 초의 "침묵
    # 구간"이 생기는 문제도 있었다(실시간 스트리밍 챗 UX와 근본적으로 안 맞음). 개인화·영수증
    # OCR엔 영향 없이 챗만 이 값을 오버라이드하려면(예: 다시 mini로 되돌리거나 다른 모델로
    # A/B하려면) 이 값만 바꾸면 된다 — receipt_vision_deployment와 동일한 fallback 패턴
    # (infra/bicep/modules/openai.bicep에 두 배포 모두 이미 있어 새 배포·RBAC 변경 없이 전환 가능).
    azure_openai_chat_rag_deployment: str | None = "chat"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def receipt_vision_deployment(self) -> str:
        return self.azure_openai_receipt_vision_deployment or self.azure_openai_chat_deployment

    @property
    def chat_rag_deployment(self) -> str:
        return self.azure_openai_chat_rag_deployment or self.azure_openai_chat_deployment


@lru_cache
def get_settings() -> Settings:
    return Settings()
