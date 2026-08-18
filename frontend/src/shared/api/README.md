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

WebSocket은 REST가 아니라 `features/realtime` 담당 (M1에서 FSD 이관됨 — §6.1).
M2에서 이 폴더에 추가 예정: `credentials: "include"`·타임아웃·401 경로(§2.2.2), `tickets.ts`(§2.2.4), `rule-params.ts`(§4.5.1).
