"""요청 속도 제한 — Phase 5 레드팀 QA가 발견한 전면 부재 이슈 대응
(docs/wedding/plan/new/17_qa_e2e_test_plan.md §14-2): 로그인 10회 연속 실패에도 429가 한 번도
뜨지 않았고, 코드 전역에 애플리케이션 레벨 rate limiting이 전혀 없었다(app/services/chat.py의
RateLimitError는 Azure OpenAI SDK 자체 예외일 뿐 이것과 무관).

Redis/큐 없이 in-memory로 충분하다 — infra/k8s/base/backend/deployment.yaml이 replicas=1(단일
파드, 이중화 없음)로 명시하는 이 프로젝트 규모에서, 여러 파드에 걸친 카운터 공유가 필요 없다.
루트 CLAUDE.md BASELINE §4의 YAGNI 금지 목록(Redis/Celery/별도 캐시 서버 등)과도 맞는 선택 —
slowapi(내부적으로 limits 패키지, 기본 in-memory 스토리지)로 충분하다."""

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request


def user_or_ip_key(request: Request) -> str:
    """인증이 필요한(LLM 비용 유발) 엔드포인트는 계정 단위로 제한한다 — 한 계정이 여러 IP를
    돌려써도 우회 못 하게. app.deps.get_current_user가 인증 성공 시 request.state.user_id를
    채워두므로, 그 값이 있으면 계정 키, 없으면(=인증 전 단계) IP로 폴백한다."""
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        return f"user:{user_id}"
    return get_remote_address(request)


# default_limits: 명시적으로 @limiter.limit()이 안 붙은 나머지 모든 엔드포인트(대부분 조회성
# GET)에 대한 방어선 — 개별 라우트별로 세세하게 튜닝할 이유가 없는 값이라 전역 하나로 둔다.
limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])
