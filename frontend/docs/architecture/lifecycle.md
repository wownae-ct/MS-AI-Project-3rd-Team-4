# 라이프사이클 — 탭 전환·오프라인·bfcache·Wake Lock

> 근거: 설계서 v2.1 §5. 구현 규칙의 SSOT는 `.claude/skills/lifecycle-recovery`,
> 수치는 CLAUDE.md §4 (「라이프사이클 타이머」).

## 1. 전이 지도

| 전이 | 신호 | 동작 |
|---|---|---|
| Foreground → Background | `visibilitychange(hidden)` | 유예 타이머 시작. 하트비트는 **동일 주기 유지**. 유예 초과 시 close + 카메라 정지 + Worker release |
| Background → Foreground | `visibilitychange(visible)` | 세대(generation) 갱신으로 낡은 타이머 무효화 → `readyState` 신뢰 금지, **ping 1회 왕복으로 재검증** → 실패 시 재연결 → `resume(lastRevision)` → Wake Lock 재획득 |
| 페이지 이탈 / bfcache 진입 | `pagehide` · `freeze` | `intentionalClose = true` → **명시적 close** + 카메라 정지 + rVFC 해제 + Wake Lock release (P0-17) |
| bfcache 복원 | `pageshow(persisted)` | attempt 리셋 + 즉시(소지터) 재연결 — 백오프 경로를 타지 않는 고속 경로 |
| 오프라인 | `offline` | 백오프 타이머 미가동 — 재연결 트리거는 `online` 이벤트뿐 |
| 온라인 복귀 | `online` | bfcache 복원과 동일한 고속 경로 |
| OS 화면 잠금 시도 | — | §5.3 Wake Lock이 발생 자체를 차단(1차 방어). 실패 시 OS가 hidden 전이 유발 → 위 Background 경로와 동일 (별도 분기 없음 — 단일 경로 원칙) |

## 2. 왜 명시적 close인가 (P0-17)

Chrome 149부터 bfcache 진입 시 브라우저가 열린 WS를 대신 닫아준다. **그래도 우리는 직접 닫는다**:
국내 사용자 상당수(웨일·삼성인터넷)가 버전 지연 Chromium이라 이 동작을 보장할 수 없고,
"브라우저가 해주겠지"는 지원 매트릭스 전체에서 성립하지 않는 가정이다 (§5.1 — 팩트체크 원자료는 로컬 준비 기획 07, 팀 문서 채널로 요청).

## 3. Wake Lock (P0-15, §5.3)

홈트는 **무조작으로 수 분 운동**이 기본 시나리오 — 화면 자동잠금이 발동하면 카메라·rVFC·WS가 동시에 죽는다.

- 획득: **세션 시작 제스처 핸들러에서** (제스처 밖 요청은 거부될 수 있다).
- `WakeLockSentinel`의 `release` 이벤트 **필수 구독** — OS는 배터리·정책 사유로 언제든 자동 해제한다. 구독 없으면 "왜 화면이 꺼졌지"를 영원히 모른다 (계측: wake_lock_failure_rate).
- 재획득은 **visible/pageshow 복귀에서만** — hidden 중 `request()`는 거부된다.
- 획득 실패는 배너로 알린다 — 사용자가 수동으로 화면 유지 설정을 할 기회.

## 4. 구현 함정

- **세대(generation) 패턴**: hidden 유예·재연결 지연 등 모든 지연 실행은 발행 시점의 세대를 캡처하고 실행 시점에 대조한다. 없으면 "복귀 후 3초 뒤에 낡은 close 타이머가 새 연결을 죽이는" 류의 간헐 버그가 난다.
- 복귀 시 `readyState === OPEN`은 믿지 않는다 — 딥 슬립에서 깨어난 소켓은 OPEN으로 보이지만 죽어 있을 수 있다. ping 왕복만이 진실 (「라이프사이클 타이머」 REVALIDATE).
- hidden 중 재연결 시도는 0회여야 한다 — §7.5 P0 수용 기준이자 intentionalClose 검증 시나리오 (S8, [plan/04_검증_수용기준.md](../plan/04_검증_수용기준.md) §2).
