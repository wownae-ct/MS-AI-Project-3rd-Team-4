# frontend

React + MediaPipe Pose + WebSocket 클라이언트.

```
src/
  pose/   T0 — MediaPipe Pose로 관절 좌표 추출
  rules/  T1 — 클라이언트 룰엔진 판정 + 렙 카운트 (서버 왕복 없음)
  api/    REST 클라이언트 — backend/app/gateway/routers/*와 1:1 대응 (health/sessions/movements/profile)
  ws/     WebSocket 클라이언트 — backend routers/ws.py 대응
  ui/     화면 컴포넌트
```

소유 브랜치: `frontend`. API/WS 계약은 `backend/app/gateway/`와 반드시 동기화할 것.
