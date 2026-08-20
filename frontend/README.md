# frontend

React 19 + TypeScript 7 + Vite 8 SPA.

설계 문서는 [`docs/`](docs/README.md)에 있다 — 툴체인 결정은 [`docs/architecture/toolchain.md`](docs/architecture/toolchain.md), 레이어 구조와 경계 강제는 [`docs/architecture/layers.md`](docs/architecture/layers.md).

## 시작하기

```bash
npm ci        # 최초 1회 (lockfileVersion 3)
npm run dev   # 개발 서버
```

**Node 버전은 [`.nvmrc`](.nvmrc)가 단일 출처다** (`24.19.0`). 하한은 `package.json`의 `engines`(`^24.15.0`)이며 근거는 `jsdom`의 요구사항이다 — 자세한 내용은 toolchain 문서 §2.

> `nvm-windows`는 `.nvmrc`를 읽지 못하므로 버전을 직접 지정해야 한다(`nvm use 24.19.0`). `fnm`은 읽는다. CI는 `node-version-file`로 자동 참조한다.

## 명령

| 명령 | 내용 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run typecheck` | `tsc -b` — 타입 검사만 |
| `npm run lint` | `oxlint --deny-warnings .` — 코드 품질 + **FSD 레이어 경계 강제** |
| `npm test` | `vitest run` |
| `npm run build` | `tsc -b && vite build` |
| `npm run preview` | 빌드 산출물 서빙 |

**검증 게이트는 4개다** — `typecheck → lint → test → build`. 커밋 전 전부 돌린다. CI도 같은 순서로 실행한다.

## 구조 — Feature-Sliced Design

```
src/
  app/        진입점 · 화면 조립 · 전역 스토어(store/)
  pages/      feedback · practice-session · report
  features/   entry-guard — 진입 판정과 안내 화면
  entities/   answer · coach-feedback · practice-session · question
  shared/
    api/      REST 클라이언트 (전송 계층 — 도메인을 모른다)
    config/   환경변수 단일 진입점(env.ts) · 브라우저 판정 상수
    lib/      wake-lock · audio-unlock
    ui/       디자인 토큰 · 공용 컴포넌트
```

**import 규칙 두 가지만 기억하면 된다:**

1. **하향만** — `app → pages → features → entities → shared`. 위로는 못 올라간다.
2. **슬라이스 안은 상대 경로, 밖은 `@/` 별칭** — `@/`가 보이면 그건 경계를 넘은 것이다. 슬라이스는 루트 `index.ts`로만 접근한다.

둘 다 `npm run lint`가 강제한다. 위반하면 어떤 규칙에 왜 걸렸는지 메시지에 나온다. 설계 근거는 [layers 문서 §4](docs/architecture/layers.md#4-경계-강제-설계).

## 환경변수

프론트가 읽는 변수는 **`VITE_API_BASE` 하나뿐**이고, 읽는 지점은 [`src/shared/config/env.ts`](src/shared/config/env.ts) 한 곳이다.

값 형식은 **오리진만, 끝 슬래시 없이**. 빌드타임에 정적 치환되므로 값을 바꾸면 재빌드가 필요하다. `VITE_*` 값은 **번들에 그대로 박혀 공개되므로 비밀을 넣지 않는다.** 자세한 내용은 [toolchain 문서 §6](docs/architecture/toolchain.md#6-환경변수).

## 브랜치

`feature/frontend` → PR → `frontend` → PR → `main`. `frontend`·`main` 직접 push 금지.

`frontend` 대상 PR은 `frontend/ · docs/ · .github/` 밖 파일을 건드리면 path-guard 워크플로우가 CI를 실패시킨다.
