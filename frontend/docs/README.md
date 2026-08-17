# frontend/docs — 프론트엔드 구현 문서

React + MediaPipe Pose + WebSocket 기반 AI 홈트레이닝 코치 SPA의 **구현자 대상 해설 문서** 모음이다.
규범이 아니라 지도다 — 규범과 충돌하면 항상 규범이 이긴다.

> ✅ **이 폴더는 커밋된다** — 루트 `.gitignore`에 `!frontend/docs/` 예외 적용 (2026-08-17, I-11 해소).
> 여기 두는 문서는 **팀 전체에 공유되는 공개 문서**다 — 로컬 메모·시크릿·개인 기록은 두지 않는다.
>
> ⚠️ **로컬 전용 참조 주의**: 아래 표의 설계서 docx·`.claude/`·`docs/plan/`은 여전히 gitignore 대상이라
> **저장소에는 없다**. 이 폴더 문서들의 해당 링크는 로컬 사본이 있어야 열린다 — 원본은 팀 문서 채널에서 받는다.

## 문서 계층 — 무엇이 어디의 유일한 출처인가

| 계층 | 위치 | 성격 |
|---|---|---|
| **규범** | `../../docs/프론트엔드_설계서_v2.1.docx` | 유일한 규범. 절 색인: `../../.claude/reference/README.md` |
| **수치 규격** | `../../.claude/CLAUDE.md` §4 | 타이머·프로토콜 상수의 **유일한 출처** — 다른 어디에도 값을 다시 적지 않는다 |
| **작업 규칙·스킬** | `../../.claude/` | Claude 작업용 (사람도 읽을 수 있으나 대상은 도구) |
| **준비 기획 (원자료)** | `../../docs/plan/` | 게이트·격차·WBS·팩트체크·리스크 실측 기록 (로컬 전용) |
| **적용 기획 (팀 공유)** | [`plan/`](plan/README.md) | 설계서 v2.1 → `frontend/` 적용 실행 계획 — 게이트·격차·로드맵·검증·리스크의 팀 공유판 |
| **구현 해설 (이 폴더)** | `frontend/docs/` | 사람 대상 — 아키텍처 지도·결정 기록·가이드 |

**이 폴더의 3원칙**
1. **값 복제 금지** — 수치는 「규격 이름」(예: 「하트비트」·「윈도우 계약」)과 설계서 절 번호로만 참조한다.
2. **"왜"를 남긴다** — 코드가 말하지 못하는 배경·기각된 대안·함정을 기록한다.
3. **구현과 함께 갱신** — 문서가 다루는 코드가 바뀌는 PR에서 해당 문서도 갱신한다 (문서 부패 방지).

## 색인

### plan/ — 설계서 v2.1 적용 기획 (2026-08-17)
| 문서 | 내용 | 설계서 근거 |
|---|---|---|
| [README.md](plan/README.md) | 적용 기획의 목적·문서 계층 내 위치·운영 원칙 | — |
| [01_전제와_착수게이트.md](plan/01_전제와_착수게이트.md) | 확정 전제 3건 · 게이트 G-1~G-4 판정 · 사전 준비물 | §0 · 부록 D.1 |
| [02_격차분석.md](plan/02_격차분석.md) | 현재 코드 ↔ 설계서 격차 전수 대장 (툴체인·소스·CI) | §1~§6 대조 |
| [03_적용로드맵.md](plan/03_적용로드맵.md) | 툴체인 정비 · FSD 이관 · M1~M5 WBS · 크리티컬 패스 | 부록 D.2 · §6.1 |
| [04_검증_수용기준.md](plan/04_검증_수용기준.md) | 골든 벡터 · MockWebSocket 시나리오 · 수용 기준 추적표 | §7 |
| [05_리스크_오픈이슈.md](plan/05_리스크_오픈이슈.md) | 리스크 R-1~R-6 · 오픈 이슈 · 재발 방지 원칙 | 부록 D.4 |
| [06_실행설계플랜.md](plan/06_실행설계플랜.md) | **통합 실행 설계 플랜 — 실행 기준 문서 (D-1~D-4 승인 · Phase 0+M1 완료)** | 전체 |
| [07_외부요청문.md](plan/07_외부요청문.md) | 외부 요청 발신용 초안 (G-3·G-4·CI 정비) + 회신 추적 | 부록 D.1 |
| [08_플랜모드_운영.md](plan/08_플랜모드_운영.md) | Claude Code 플랜 모드·서브에이전트 ↔ 이 문서군 연동 규칙 | — (공식 문서 근거) |

### architecture/ — 도메인별 아키텍처 해설
| 문서 | 내용 | 설계서 근거 |
|---|---|---|
| [overview.md](architecture/overview.md) | 시스템 컨텍스트 · 엔드투엔드 데이터 흐름 · 스레드/소유권 지도 | §1 · §4 · §6 |
| [directory-structure.md](architecture/directory-structure.md) | FSD 레이어·슬라이스 지도 · import 규칙 · 이관 전/후 | §6.1 |
| [realtime.md](architecture/realtime.md) | WS 8상태 머신 · 인증/resume · Envelope · 바이너리 프레임 | §2 · §3 |
| [vision-pipeline.md](architecture/vision-pipeline.md) | 카메라 캡처 → Worker 추론 → CANON19 윈도우 → 업링크 | §4.1~§4.4 |
| [rules-and-coaching.md](architecture/rules-and-coaching.md) | T1 룰 엔진 · rule_params 확보 경로 · 오디오 큐 · 판정 권위 | §4.5 |
| [lifecycle.md](architecture/lifecycle.md) | 탭 전환·오프라인·bfcache·Wake Lock — 전이와 복구 | §5 |
| [deployment.md](architecture/deployment.md) | SWA 배포 · 환경별 빌드 · CSP · 진입 경로 가드 | §6.2 · §6.4 |

### adr/ — 아키텍처 결정 기록
| 문서 | 내용 |
|---|---|
| [README.md](adr/README.md) | ADR 운영 절차 — 무엇이 ADR감인가, 언제 쓰는가 |
| [TEMPLATE.md](adr/TEMPLATE.md) | ADR 템플릿 |

### guides/ — 실무 가이드
| 문서 | 내용 |
|---|---|
| [onboarding.md](guides/onboarding.md) | 새 팀원 셋업 · 읽기 순서 · 첫 기여까지 |
| [testing.md](guides/testing.md) | 테스트 실행·작성 관례 · 테스트 자산 지도 |
| [troubleshooting.md](guides/troubleshooting.md) | 증상 → 원인 → 절차 (구현·디버깅 중 함정 목록) |

## 갱신 규칙

- 마일스톤(M1~M5) 경계마다 해당 도메인 문서를 실제 코드와 대조한다 (실행 기준: [plan/06_실행설계플랜.md](plan/06_실행설계플랜.md)).
- 설계서가 개정되면(현재 v2.1) 절 번호 참조를 전수 점검한다.
- 문서 소유: 프론트 담당. 인프라·백엔드 사실은 여기서 단정하지 않고 담당 채널로 확인해 출처를 남긴다.
