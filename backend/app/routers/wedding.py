"""#2-6 — 03_API_spec.md §3. 온보딩(웨딩 프로필 생성/조회/수정)과 카테고리 On/Off·예산 배분."""

from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["wedding"])


@router.post("/weddings")
async def create_wedding():
    raise HTTPException(status_code=501, detail="not implemented yet")


@router.get("/weddings/me")
async def get_wedding():
    raise HTTPException(status_code=501, detail="not implemented yet")


@router.patch("/weddings/me")
async def update_wedding():
    raise HTTPException(status_code=501, detail="not implemented yet")


@router.get("/weddings/me/categories")
async def list_wedding_categories():
    raise HTTPException(status_code=501, detail="not implemented yet")


@router.put("/weddings/me/categories")
async def update_wedding_categories():
    raise HTTPException(status_code=501, detail="not implemented yet")
