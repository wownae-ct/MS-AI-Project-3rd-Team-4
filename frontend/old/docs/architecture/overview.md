# 시스템 개요 — 컨텍스트·데이터 흐름·소유권 지도

> 근거: 설계서 v2.1 §1(스택) · §4(파이프라인) · §6(운영 환경). 수치는 전부 `.claude/CLAUDE.md` §4 참조.

## 1. 시스템 컨텍스트

```
사용자(웹캠) ──┐
               ▼
┌─────────────────────────────────────────────┐        ┌──────────────────────┐
│  SPA (Azure SWA 정적 서빙, Chromium 전용)     │  REST  │  BFF / Gateway        │
│  React 19 · Vite · TS strict · Zustand      │◄──────►│  (HttpOnly 쿠키 인증,  │
│                                             │        │   WS 티켓 발급)        │
│  MediaPipe Pose (Worker, self-hosted WASM)  │  WS    ├──────────────────────┤
│                                             │◄──────►│  실시간 세션 서버       │
└─────────────────────────────────────────────┘        │  (AKS ingress 직결 —  │
                                                       │   SWA 미경유)          │
                                                       └──────────────────────┘
```

핵심 경계 3가지:
- **정적 호스팅과 실시간 경로의 분리** — WS는 어떤 구성에서도 SWA를 경유하지 않고 백엔드 인그레스로 직접 연결된다 (§1·§6.4).
- **원본 영상은 브라우저를 떠나지 않는다** — 네트워크로 전송되는 것은 CANON19 좌표뿐 (P0-10, §6.6).
- **Refresh Token은 JS에 존재하지 않는다** — BFF HttpOnly 쿠키 전용. WS 인증은 쿠키가 아니라 1회용 티켓 (P0-1·2, §2.2).

## 2. 엔드투엔드 데이터 흐름 (세션 중)

```
[메인 스레드]                          [Worker (탭당 1개 싱글턴)]
 getUserMedia → <video>
   │ rVFC 캡처 (대기열 최대 1)
   │   프레임 transfer ──────────────► MediaPipe Pose 추론
   │                                    (추론용 OffscreenCanvas·GPU delegate)
   │                                   33 랜드마크
   │                                    → CANON19 축약 (19관절×6채널)
   │                                    → 윈도우 조립 (고정 격자 리샘플)
   │ ◄────────────── 좌표 배열(오버레이용) + 윈도우 payload ──┘
   │
   ├─ T1 룰 판정 (순수 함수, 잠정) ──► 큐/자막 (서버 판정 도착 시 정정)
   ├─ Zustand 스토어 (transient) ──► rAF 오버레이 렌더 (캔버스는 메인 소유)
   └─ 24B 헤더 작성 + ws.send ──────► 서버 (백프레셔: 링 버퍼 + bufferedAmount defer)
```

방향별 소유권 원칙 (혼동 잦은 곳):
| 자산 | 소유 | 근거 |
|---|---|---|
| 렌더(오버레이) 캔버스 | **메인 스레드** — Worker는 좌표 배열만 반환 | P0-7, §4.2 |
| 추론용 OffscreenCanvas | Worker — GPU delegate의 공식 필수 입력, 위 원칙의 예외가 아니라 별개 경로 | P0-7, §4.2 |
| 캡처 프레임 close() | 생성 경로 무관 **정확히 1회** — Worker 완료분은 Worker, 드롭분은 메인 즉시 | P0-8, §4.1.1 |
| 24B 헤더 작성·`ws.send` | **메인 스레드** — Worker는 payload까지만 | P0-14, §4.4.0 |
| 판정 권위 | **서버** (`verdict_source`) — T1 룰은 잠정 | §4.5 · §2.1 |

## 3. 상태 관리 (Zustand — §1.1)

- 프레임 단위 고빈도 데이터(랜드마크·각도·지연)는 `store.subscribe` transient update로만 소비 — **React state 승격 금지**.
- 컴포넌트 노출은 요약치(렙 카운트·현재 fault·연결 상태·세트 진행도)만, 갱신 스로틀 적용.
- 오버레이는 rAF 루프가 스토어를 직접 읽는다 (React 렌더 사이클 밖).

## 4. 왜 이 구조인가 (기각된 대안)

- **Worker Pool 기각** → 탭당 1개 싱글턴 (P0-6): 포즈 추론은 순차 프레임 의존이라 병렬화 이득이 없고, GPU 컨텍스트·모델 메모리만 배수로 든다.
- **rAF 캡처 폴백 기각** (v2.0에서 삭제): rVFC 부재 = 비지원 브라우저 → 안내 화면 (§6.2.1). rAF는 3용처(오버레이·프레임 예산 실측·Worker 실패 시 저주기 강등)만 존치.
- **REST 전체 동기화(sync_full) 폴백 기각** → `resume(lastRevision)` 단일 경로 (P0-4): 이중 동기화 경로는 정합 버그의 온상.
- **WS SDK(socket.io 등) 기각** → 네이티브 WebSocket (§1): 재연결·하트비트 의미론을 설계서가 직접 규정하므로 SDK 추상화가 오히려 방해.

## 5. 더 읽기

- 디렉토리 배치 → [directory-structure.md](directory-structure.md)
- WS 프로토콜 상세 → [realtime.md](realtime.md)
- 캡처·추론 파이프라인 상세 → [vision-pipeline.md](vision-pipeline.md)
- 룰 엔진·코칭 → [rules-and-coaching.md](rules-and-coaching.md)
- 라이프사이클·복구 → [lifecycle.md](lifecycle.md)
- 배포·환경 → [deployment.md](deployment.md)
