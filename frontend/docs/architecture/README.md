# architecture/ — 적용 설계 빠른 길잡이

> **최종 갱신** 2026-08-25 (백엔드 연동 설계 3종 신설)
>
> 이 폴더는 프론트엔드가 **실제로 적용하기로 한 설계와 그 근거**를 담는다.  
> 처음 온 사람은 아래 표만 보면 된다.

## 한눈에 보기

| 문서 | 언제 읽나 | 핵심 내용 |
|---|---|---|
| [toolchain.md](toolchain.md) | Node/TypeScript/CI 값이 궁금할 때 | 런타임 기준선, 타입체크, 빌드, 환경변수, CI 게이트 |
| [layers.md](layers.md) | 파일을 어디에 둘지 헷갈릴 때 | FSD 레이어, 경로 별칭, 경계 강제, 현재 배치 진단 |
| [backend-integration.md](backend-integration.md) | 백엔드에 붙일 때 · 로그인이 안 될 때 | 전송 계층 5계약, `VITE_API_BASE` 형식 게이트, 세션·라우트 가드, **브라우저 지원 매트릭스**, 로컬이 가리는 것 |
| [api-contract.md](api-contract.md) | 어떤 엔드포인트를 어떻게 부르나 | 프론트가 부르는 계약 발췌, 계약 어휘(Literal), **TS 이관 함정 7종**, 드리프트 감지 |
| [chat-streaming.md](chat-streaming.md) | S3 상담을 만들 때 | SSE 와이어·파서 계약, 이벤트 7종 상태 기계, **종료 판정**, 실패 모드 |

## 읽는 순서

1. [toolchain.md](toolchain.md) — 실행 환경과 검증 게이트를 먼저 확인한다.
2. [layers.md](layers.md) — 그 다음 import 경계와 파일 배치를 본다.
3. [../adr/README.md](../adr/README.md) — 왜 이 결정이 나왔는지 필요할 때 본다.

백엔드에 붙는 작업이라면 [backend-integration.md](backend-integration.md)를 **먼저** 읽는다 — §5 「로컬이 가리는 것」이 배포 시점에 되살아나는 제약 4건을 정리하고 있다.

## 이 폴더의 역할

- `toolchain.md`는 "무엇을 쓰는가"를 정리한다.
- `layers.md`는 "어디에 두는가"를 정리한다.
- `backend-integration.md` · `api-contract.md` · `chat-streaming.md`는 "밖과 어떻게 이야기하는가"를 정리한다.
- 전부 규범이 아니라 **이 저장소의 적용 결과**를 적는다.

> ⚠️ **연동 문서 3종은 백엔드를 관측해 옮겨 적은 것이다.** 백엔드는 빠르게 움직이므로 인용값(줄 번호·필드명·기본값)은 **관측 시점의 사실이지 보증이 아니다.** 갱신 절차는 [backend-integration.md](backend-integration.md) §7.
