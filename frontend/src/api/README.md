# api

REST 클라이언트. `backend/app/gateway/routers/*`와 파일 단위로 1:1 대응한다 (admin.py는 운영자용이라 앱 UI엔 불필요해서 제외).

| 이 폴더 | 백엔드 라우터 |
|---|---|
| `health.ts` | `routers/health.py` |
| `sessions.ts` | `routers/sessions.py` |
| `movements.ts` | `routers/movements.py` |
| `profile.ts` | `routers/profile.py` |

백엔드가 전부 `501 not implemented` 스텁이라 응답 타입도 전부 `unknown`으로 잡아뒀다.
실제 Pydantic 응답 모델이 정해지면 그때 타입을 채울 것 — 지금 미리 지어내지 않는다.

WebSocket(`/ws/v1/sessions/{id}`)은 REST가 아니라 `../ws/client.ts`.
