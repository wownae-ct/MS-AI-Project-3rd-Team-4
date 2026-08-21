"""질문 뱅크. 카테고리(기술면접/고객설명/장애보고)별 연습 질문 목록."""

from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["questions"])


@router.get("/questions")
async def list_questions(category: str | None = None):
    raise HTTPException(status_code=501, detail="not implemented yet")
