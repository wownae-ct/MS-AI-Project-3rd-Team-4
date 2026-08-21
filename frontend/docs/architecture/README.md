# architecture/ — 적용 설계 빠른 길잡이

> **최종 갱신** 2026-08-21
>
> 이 폴더는 프론트엔드가 **실제로 적용하기로 한 설계와 그 근거**를 담는다.  
> 처음 온 사람은 아래 표만 보면 된다.

## 한눈에 보기

| 문서 | 언제 읽나 | 핵심 내용 |
|---|---|---|
| [toolchain.md](toolchain.md) | Node/TypeScript/CI 값이 궁금할 때 | 런타임 기준선, 타입체크, 빌드, 환경변수, CI 게이트 |
| [layers.md](layers.md) | 파일을 어디에 둘지 헷갈릴 때 | FSD 레이어, 경로 별칭, 경계 강제, 현재 배치 진단 |

## 읽는 순서

1. [toolchain.md](toolchain.md) — 실행 환경과 검증 게이트를 먼저 확인한다.
2. [layers.md](layers.md) — 그 다음 import 경계와 파일 배치를 본다.
3. [../adr/README.md](../adr/README.md) — 왜 이 결정이 나왔는지 필요할 때 본다.

## 이 폴더의 역할

- `toolchain.md`는 "무엇을 쓰는가"를 정리한다.
- `layers.md`는 "어디에 두는가"를 정리한다.
- 둘 다 규범이 아니라 **이 저장소의 적용 결과**를 적는다.
