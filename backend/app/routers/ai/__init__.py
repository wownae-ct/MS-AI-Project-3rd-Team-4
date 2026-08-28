"""AI/LLM 관련 엔드포인트 묶음(2026-08-26 라우터 폴더 리스트럭처링) — RAG 상담(chat), 개인화
라우터 에이전트 수동 재생성(personalization), AI 산출물 신고(feedback) 셋 다 LLM 호출 자체가
핵심이거나(chat/personalization) LLM이 만든 콘텐츠를 다루는 대상(feedback)이라는 공통점으로
묶었다 — 웨딩의 정적 CRUD 데이터를 다루는 app/routers/wedding/과 성격이 다르다."""

from fastapi import APIRouter

from app.routers.ai.chat import router as chat_router
from app.routers.ai.feedback import router as feedback_router
from app.routers.ai.personalization import router as personalization_router

router = APIRouter()
router.include_router(chat_router)
router.include_router(feedback_router)
router.include_router(personalization_router)
