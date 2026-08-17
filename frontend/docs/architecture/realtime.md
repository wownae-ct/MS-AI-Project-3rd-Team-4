# 실시간 통신 — WS 상태 기계·인증·재동기화·프레이밍

> 근거: 설계서 v2.1 §2(연결·보안) · §3(Envelope·바이너리). 구현 규칙의 SSOT는
> `.claude/skills/realtime-ws-protocol` · `binary-frame-protocol`, 수치는 CLAUDE.md §4
> (「하트비트」·「백오프」·「핸드셰이크 타임아웃」·「티켓·epoch」·「종료 코드」·「seq·revision·ACK」).
> ⚠️ 현행 `src/ws/client.ts`는 구계약(wave0) 뼈대이며 M2에서 본 문서 내용대로 **재작성**된다. 착수 전 게이트 G-4(카탈로그 합의) 필수.

## 1. 8상태 머신 (§2.3)

```
DISCONNECTED ──connect()──► CONNECTING ──open──► AUTHENTICATING ──auth_ok┬─(초회)──► CONNECTED
     ▲                          │                     │                  └─(재연결)─► RESUMING ──resume_ok/snapshot──► CONNECTED
     │                          │ CONNECT_TIMEOUT     │ AUTH_TIMEOUT / auth_err          │ RESUME_TIMEOUT(재시도 소진)
     │                          ▼                     ▼                                  ▼ 또는 resume 'rejected'
     └─(사용자 종료)      RECONNECTING ◄──(비의도적 close·타임아웃 전반)──┘          RESYNC_FAILED ──► 세션 재시작
                               │  백오프 full jitter 후 CONNECTING 재진입
                               ▼
                            FAILED  ◄── 4003·4009 수신 / 연속 티켓 실패 임계 (자동 재시도 금지, 수동 개입만)
```

상태 기계의 불변 조건:
- **재연결 스케줄링은 이 상태 기계의 단일 경로만** — 다른 어디서도 `new WebSocket()` 하지 않는다 (P0-5③).
- CONNECTING 진입 시 `intentionalClose = false` 리셋 + `binaryType = 'arraybuffer'` 즉시 설정.
- 지연 실행(타이머 콜백)은 세대(generation) 검사로 무효화 — 낡은 타이머가 새 연결을 건드리지 못하게.

## 2. 인증 — 티켓 우선, 쿠키 불신 (§2.2)

1. REST(BFF)에서 **단수명·1회용 티켓** 발급 (쿠키는 여기까지만 관여).
2. WS open 직후 첫 메시지 `{type:'auth', ticket, auth_epoch}` — **URL 쿼리에 싣지 않는다** (P0-2).
3. `auth_ok` 수신 전 업무 메시지 전송 금지 (P0-3). `auth_ok`가 `session_started_at`을 주고, 이것이 t_offset_ms의 원점(session_epoch)이 된다.
4. epoch 만료 임박 시 in-band `reauth` — 연결 유지 채로 갱신.

**동일 도메인이 되어도 티켓·Origin 검증은 폐지하지 않는다** — CSWSH 상설 방어 계층 (P0-2 불변 규정).
티켓 발급 실패 카운터와 네트워크성 재연결 카운터는 **별개** — 혼동하면 FAILED 판정이 오염된다 (「티켓·epoch」).

## 3. 재동기화 — resume 단일 경로 (§2.1)

- 재연결 후 `resume(lastRevision)` — `lastRevision`은 **적용 완료된 것만** 갱신해 둔다.
- 서버는 `resume_ok`(델타 재생) 또는 `snapshot`(전체 상태)으로 응답. REST `sync_full` 폴백은 **만들지 않는다** (P0-4).
- 실패 처리: 재시도 소진 또는 `rejected` 수신 시에만 RESYNC_FAILED → 세션 재시작 안내.
- `seq`는 연결 단위(재연결 시 0 리셋)·방향별 독립, `revision`은 세션 단위·서버 권위 — 두 카운터의 수명이 다르다는 것이 이 프로토콜의 핵심. ACK는 흐름 확인·유실 계량 전용이며 **업링크 재전송은 없다** (실시간 코칭에서 낡은 포즈 재전송은 무의미).

## 4. 하트비트·백오프 (§2.1.3)

- 앱 레벨 `ping(nonce)`/`pong(nonce)` — 브라우저는 프로토콜 레벨 ping을 노출하지 않으므로 앱 레벨이 필수.
  **hidden 상태에서도 주기 유지**, 1차 미스 확정 시 **즉시 재-ping** (고정 주기로 짜면 최악 감지가 늘어난다 — 「하트비트」).
- 주기가 인프라 유휴 타임아웃(ingress 기본값)보다 짧아야 하는 것이 설계 근거 — **주기를 늘리는 "최적화" 금지**.
- 백오프는 full jitter. attempt 리셋은 **CONNECTED 일정 시간 연속 유지 시** — 접속 즉시 리셋하면 플래핑 시 무한 고속 재시도가 된다 (「백오프」).
- offline 중에는 백오프 타이머를 돌리지 않는다 — 재연결 트리거는 online 이벤트뿐 (§5.2).

## 5. 종료 코드 분기 (§2.3.1)

| 수신 코드 | 처리 |
|---|---|
| 1000·1001 | `intentionalClose` 확인 — true면 종료, false면 지터 재접속 |
| 1005·1006 | **플래그 확인 후** 백오프 재접속 (실무 최빈 경로 — 여기서 플래그를 안 보면 의도 종료가 되살아난다, P0-5②) |
| 4001 | 티켓 재발급 후 재접속 |
| 4003·4009 | **FAILED — 자동 재시도 금지** |
| 4008 | 백오프 재접속 (핸드셰이크 타임아웃 계열) |

클라이언트가 보내는 `close(code)`는 1000 또는 4000번대만 — 3000번대는 IANA 라이브러리 범위라 `InvalidAccessError`가 난다.

## 6. 메시지 계층 (§3)

- **텍스트 Envelope**: `{v, type, seq, ack?, revision?, ts, payload}` — type 카탈로그는 §3.1 `EnvelopeType` 14종
  (`auth`·`auth_ok`·`auth_err`·`reauth`·`ping`·`pong`·`resume`·`resume_ok`·`snapshot`·`delta`·`session_pause`·`session_resume`·`verdict`·`error`). 계약 변경은 백엔드와 동기화 없이 머지 금지.
- **바이너리 프레임**: 24바이트 고정 헤더(리틀엔디언, magic `'W','V','0'`, type `0x01 = POSE_WINDOW` 유일) + CANON19 윈도우 payload.
  레이아웃·오프셋의 SSOT는 `.claude/skills/binary-frame-protocol` — **여기 복제하지 않는다.**
- **한 메시지에 텍스트와 바이너리를 섞지 않는다** (P0-11).

## 7. 수신 가드 — "무성 행" 방지 (§3.5)

수신 검증 실패(잘못된 magic·길이 불일치·버전 불일치·상한 초과·JSON 파싱 실패)는
**예외가 아니라 프레임 폐기 + 카운터 증가**다. `onmessage` 밖으로 예외가 나가면
소켓은 OPEN인데 처리만 멈추는 최악의 장애(무성 행)가 된다 (P0-12).
가드 함수와 골든 벡터(정상·거부)는 `shared/protocol`에 있고, 코덱 회귀 시 골든이 기준이다
(코덱 출력으로 골든을 갱신하는 순환 참조 금지 — `docs/plan/06_테스트_검증준비.md`).
