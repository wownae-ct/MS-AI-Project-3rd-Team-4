"""웨딩 도메인 핵심 CRUD/조회 묶음(2026-08-26 라우터 폴더 리스트럭처링) — 온보딩/조회/수정
(wedding), 카테고리 마스터(category), 지출·납부·참가격(budget), 체크리스트(checklist),
타임라인(timeline), 대시보드·리포트 집계(dashboard), 업체 사례 카드(vendor_case) 전부
get_current_wedding으로 유도한 wedding_id를 중심으로 도는 웨딩 1건의 데이터라는 공통점으로
묶었다. CLAUDE.md 아키텍처 표의 도메인 구분(health/auth/wedding/category/budget/vendor_case/
chat/dashboard)에서 웨딩 자체의 하위 데이터(카테고리/예산/체크리스트/타임라인/대시보드/업체
사례)를 물리적으로도 한 폴더에 모은 것 — auth/chat처럼 성격이 뚜렷이 다른 것만 밖에 남긴다."""

from fastapi import APIRouter

from app.routers.wedding.budget import router as budget_router
from app.routers.wedding.category import router as category_router
from app.routers.wedding.checklist import router as checklist_router
from app.routers.wedding.dashboard import router as dashboard_router
from app.routers.wedding.timeline import router as timeline_router
from app.routers.wedding.vendor_case import router as vendor_case_router
from app.routers.wedding.wedding import router as wedding_router

router = APIRouter()
router.include_router(wedding_router)
router.include_router(category_router)
router.include_router(budget_router)
router.include_router(vendor_case_router)
router.include_router(checklist_router)
router.include_router(timeline_router)
router.include_router(dashboard_router)
