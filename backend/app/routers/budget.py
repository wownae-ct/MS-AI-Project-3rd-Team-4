"""#8-15 — 03_API_spec.md §3. 체크리스트, 지출/납부(payments), 참가격 벤치마크."""

from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["budget"])


@router.get("/checklists/{category_code}")
async def list_checklist_items(category_code: str):
    raise HTTPException(status_code=501, detail="not implemented yet")


@router.put("/checklists/items/{item_id}/progress")
async def update_checklist_progress(item_id: int):
    raise HTTPException(status_code=501, detail="not implemented yet")


@router.get("/payments")
async def list_payments():
    raise HTTPException(status_code=501, detail="not implemented yet")


@router.post("/payments")
async def create_payment():
    raise HTTPException(status_code=501, detail="not implemented yet")


@router.patch("/payments/{payment_id}")
async def update_payment(payment_id: str):
    raise HTTPException(status_code=501, detail="not implemented yet")


@router.delete("/payments/{payment_id}")
async def delete_payment(payment_id: str):
    raise HTTPException(status_code=501, detail="not implemented yet")


@router.get("/payments/upcoming")
async def list_upcoming_payments():
    raise HTTPException(status_code=501, detail="not implemented yet")


@router.get("/benchmarks/compare")
async def compare_benchmark():
    raise HTTPException(status_code=501, detail="not implemented yet")
