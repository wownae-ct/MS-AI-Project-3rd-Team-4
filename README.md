# 메리맵 (MarryMap) — frontend

SeSAC MS AI 엔지니어 4기 3차 프로젝트 (2인 팀)의 프론트엔드. 예식장·스드메(드레스/스튜디오/
메이크업) 중심 예산·타임라인·계약전 체크리스트 관리와 RAG 기반 AI상담을 제공하는 React 앱.
이 브랜치는 `frontend/`를 소유한다. 전체 프로젝트 개요·백엔드는 [`main` 브랜치
README](../../tree/main/README.md) 참고.

## 스택

React 19 + TypeScript + Vite 8 + Tailwind CSS v4 + Base UI, Vitest, oxlint. Feature-Sliced
Design(FSD) 구조.

## 화면

| 화면 | 내용 |
|---|---|
| S0 | 로그인 — 이메일+비밀번호, 소셜 로그인(구글·네이버 라이브, 카카오·애플 노출) |
| S1 | 온보딩 — 9단계(지역/예산 → 취향 → 카테고리 on/off → 우선순위 → 진행상황 → 자유서술 → 리뷰), `POST /weddings` SSE 스트림 소비, 카테고리/예산을 한 번에 전송(개인화 LLM 호출 1회로 통합) |
| S2 | 대시보드 — 요약, 예산 벤치마크 카드, 카테고리별 체크리스트 진행률 |
| S3 | 카테고리 상세 — 체크리스트(citation 배지, 클릭 시 근거 확장) + 시세비교 |
| S4 | 타임라인 — D-day 기준 항목, 준비기간 스케일링 반영 |
| S5 | 리포트 — 카테고리별 진행률(타임라인 기준) |
| S6 | 예산 — 4분류(지불완료/지불예정/배정/미배정), 결제 등록·수정(환불/취소 포함)·영수증 OCR 자동입력 |
| 설정(⚙️) | 로그아웃, 비밀번호 변경/온보딩 다시하기(준비 중 placeholder) |

AI상담(챗)은 별도 화면 — SSE(`fetch` + `ReadableStream`, POST라 `EventSource` 사용 불가)로
스트리밍, flex-fill 레이아웃. WebSocket 없음.

## 시작하기

```bash
cd frontend
npm install
npm run dev        # 개발 서버
```

## 명령
npm run dev	            Vite 개발 서버
npm run lint	oxlint .
npm run test	vitest run
npm run build	tsc -b && vite build (산출물 dist/)
npm run depcruise	FSD 레이어 경계 검사(dependency-cruiser)
검증 게이트: typecheck → lint → test → build. 커밋 전 전부 돌리며, CI(frontend-ci.yml)도 같은 순서로 실행한다.

## 폴더 구조
src/
  app/          App.tsx(RouterProvider) · router/router.tsx(코드 기반 라우트 트리, lazy 분할)
                · ui/AppShell.tsx(탭바↔사이드바)
  pages/        dashboard(S2) · category(S3) · timeline(S4) · report(S5) · budget(S6) ·
                onboarding(S1) · settings
  entities/     도메인 타입 + API 클라이언트 — wedding · payment · chat · dashboard ·
                vendor-case · personalization · checklist · timeline
  shared/
    api/        REST 클라이언트 — backend/app/routers/* 와 1:1 대응하는 유일한 출처
    ui/         디자인 시스템(Page · Card · Button · Badge · Money · Progress · Tabs ·
                ErrorBoundary · icons), styles.css/theme.css

frontend/old/에 이전 주제(크로스핏 폼 코치 — MediaPipe 파이프라인, WS 8-state machine, 24B
바이너리 프로토콜) 구현 아카이브 — tsconfig/.oxlintrc.json/vite.config.ts에서 전부
제외. 손대지 말 것, 필요하면 조각만 복사해서 src/로 이식.

## 빌드 게이트
npm run build 마지막 단계에서 scripts/check-bundle-budget.mjs가 산출물을 디스크에서 읽어
검사한다 — JS/CSS gzip 예산, 최대 청크, 폰트 raw 크기, 그리고 디자인 규범(팔레트 밖 색,
토큰 밖 라운드, 다크모드, 소스 내 색 임의값/ring-*/그림자 토큰 사용 여부). 위반이면 exit 1이고
우회 플래그가 없다.

## 배포
- 같은 AKS Ingress 아래 /로 서빙(same-origin, /api는 backend) — frontend push가 staging, main push가 production 트리거(2026-08-26, 서드파티 쿠키 차단 우회를 위해 same-origin으로 전환)
- Azure Static Web Apps: PR 프리뷰 + 로컬 크로스오리진 개발/테스트용으로 병행 운영 (frontend-ci.yml, VITE_API_BASE를 빌드 타임에 굽기 때문에 staging/production 이미지가 별도 태그로 빌드됨)

## 브랜치 전략
feature/frontend-* → PR → frontend → PR → main.
전체 브랜치 전략·폴더 소유권은 main README 참고.
