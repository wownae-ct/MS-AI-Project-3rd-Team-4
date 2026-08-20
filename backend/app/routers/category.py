"""#7 GET /categories — 03_API_spec.md §3. 7개 카테고리 마스터 목록."""

from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["category"])


@router.get("/categories")
async def list_categories():
    raise HTTPException(status_code=501, detail="not implemented yet")
