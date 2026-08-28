"""인프라/운영 성격 엔드포인트 묶음 — 웨딩 도메인 데이터가 없는 것들(2026-08-26 라우터 폴더
리스트럭처링, 사용자 요청: routers/가 너무 flat해서 용도별로 정리). health(헬스체크)와
client_error(프론트 렌더 크래시 리포팅) 둘 다 인증 없이 열려 있고 특정 웨딩/유저에 종속되지
않는다는 공통점으로 묶었다."""

from fastapi import APIRouter

from app.routers.system.client_error import router as client_error_router
from app.routers.system.health import router as health_router

router = APIRouter()
router.include_router(health_router)
router.include_router(client_error_router)
