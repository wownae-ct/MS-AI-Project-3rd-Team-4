# 온보딩 — 셋업과 읽기 순서

## 1. 셋업

```bash
cd frontend        # npm 명령은 전부 여기서 (package.json 위치)
npm ci
npm run dev        # 개발 서버
npm run build      # 타입검사 + 빌드
npm run lint       # oxlint
npm test           # vitest run
```

- Node는 22.12+ 또는 24 LTS (Node 20은 EOL — 로컬에서도 쓰지 않는다).
- 지원 브라우저는 **Chromium 계열만** — 개발·테스트도 Chrome/Edge에서. Safari·Firefox에서 "안 되는데요"는 버그가 아니라 스코프컷이다 (§6.3).

## 2. 읽기 순서 (반나절 코스)

1. `frontend/docs/README.md` — 문서 계층: 무엇이 어디의 유일한 출처인가. **이것부터.**
2. [architecture/overview.md](../architecture/overview.md) — 시스템 전체 그림·소유권 지도.
3. `.claude/CLAUDE.md` — §0(작업 범위 규칙) → **§2(P0 17건 — 절대 어기면 안 되는 것)** → §4(수치 규격).
4. 자기가 맡을 도메인의 architecture/ 문서 1편 + 대응 `.claude/skills/` 1편.
5. `docs/plan/05_구현로드맵_WBS.md` — 지금 어느 마일스톤이고 무엇이 게이트에 걸려 있는가.

## 3. 첫 기여 전 알아야 할 규칙 (요약)

- **브랜치 흐름**: `feature/frontend` → PR → `frontend` → PR → `main`. 통합 브랜치 직접 push 금지.
  이 브랜치의 소유 폴더는 `frontend/`뿐 — 밖을 건드리면 path-guard CI가 PR을 실패시킨다.
- **승인 필요 작업**: `package.json`·`tsconfig*`·`vite.config.ts` 수정, 의존성 추가, 디렉토리 이관 (§0).
- **코드 스타일**: TS strict·`any` 금지, 주석은 한국어로 "왜"+설계서 절 번호, 수치는 `shared/config` 상수로 (매직넘버 금지), 테스트는 대상 파일 옆 `*.test.ts(x)`.
- **백엔드는 501 스텁** — 응답 타입은 `unknown` 유지, Pydantic 확정 전 타입 지어내지 않는다.
- 설계서와 코드가 다르면 **고치지 말고 보고** — 격차 대장은 `docs/plan/02_현재상태_격차분석.md`.

## 4. 지금의 함정 (2026-08-17 기준)

- `src/ws/client.ts`는 구계약(wave0) 뼈대 — **참고하되 모방 금지.** 규범은 §3.1 EnvelopeType이고 M2에서 재작성한다 (게이트 G-4 선행).
- `src/pose`·`src/rules` README의 성능 수치는 구판 — 신뢰하지 말 것 (이관 시 갱신 예정).
- FSD 이관 전 평면 구조다 — 새 파일은 `.claude/skills/directory-placement` 기준으로 배치.
