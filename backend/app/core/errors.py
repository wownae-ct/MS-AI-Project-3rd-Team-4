"""표준 에러 응답 헬퍼. 03_API_spec.md §2 포맷({"error":{"code":...,"message":...}})을
모든 라우터/서비스가 동일하게 만들도록 한다 — HTTPException(detail=...)을 직접 조립하면
누군가는 message를 빼먹는 식으로 포맷이 흩어지기 쉽다."""

from fastapi import HTTPException


def api_error(status_code: int, code: str, message: str, **extra: object) -> HTTPException:
    """extra는 BUDGET_BELOW_PAID(03_API_spec.md #10)처럼 error 객체에 category_code/
    min_required 같은 구조화된 필드를 더 실어야 하는 에러코드를 위한 것 — 대부분의 호출은
    안 씀."""
    return HTTPException(
        status_code=status_code,
        detail={"error": {"code": code, "message": message, **extra}},
    )
