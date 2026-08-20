"""표준 에러 응답 헬퍼. 03_API_spec.md §2 포맷({"error":{"code":...,"message":...}})을
모든 라우터/서비스가 동일하게 만들도록 한다 — HTTPException(detail=...)을 직접 조립하면
누군가는 message를 빼먹는 식으로 포맷이 흩어지기 쉽다."""

from fastapi import HTTPException


def api_error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=status_code, detail={"error": {"code": code, "message": message}}
    )
