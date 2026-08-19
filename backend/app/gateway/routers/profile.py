"""사용자 프로필 + 부상 이력 (safety agent가 참조)."""

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/profile", tags=["profile"])


@router.put("")
async def update_profile():
    raise HTTPException(status_code=501, detail="not implemented yet")


@router.post("/injuries")
async def add_injury():
    raise HTTPException(status_code=501, detail="not implemented yet")
