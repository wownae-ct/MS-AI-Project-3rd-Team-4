"""#16 GET /vendor-cases [신규 F10] — 03_API_spec.md §3. 예식장·스드메 전용 업체 사례 카드."""

from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["vendor-case"])


@router.get("/vendor-cases")
async def list_vendor_cases():
    raise HTTPException(status_code=501, detail="not implemented yet")
