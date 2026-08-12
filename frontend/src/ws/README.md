# ws

WebSocket 클라이언트 (`client.ts`). `backend/app/gateway/routers/ws.py`와 메시지 스키마를 공유하므로,
계약 변경 시 반드시 백엔드 담당자와 동기화할 것 (WS 메시지 목록: session.hello, pose.chunk, rep.verdict, coach.delta 등).
