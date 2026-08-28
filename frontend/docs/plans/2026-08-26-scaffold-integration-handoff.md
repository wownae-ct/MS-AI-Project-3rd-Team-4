# 스캐폴드 화면 통합 — 진행 상황 인계 (2026-08-26)

> 세션 클리어 후 이어받는 사람이 가장 먼저 읽는 문서. `frontend/docs/architecture/integration-status.md`
> (T9~T11 인계 문서)와는 별개 — 이 문서는 **S1~S6 화면을 스캐폴드에서 이식하는 작업**만 다룬다.

## 0. 배경 — 왜 이 작업을 하는가

`feature/frontend-e2e-scaffold` 브랜치(origin에도 있음)의 커밋 `8fa76f0`
("feat(frontend): 메리맵 FSD 스캐폴드 + S1/S2/S3/S4/S6 화면 반영")에 S1~S6 대부분의 화면이 이미
구현돼 있는 걸 발견했다. 처음부터 새로 만드는 대신 그걸 이식 + 실API 정합성 검증 + 리팩토링하는
쪽이 빠르다고 판단(2026-08-26, 사용자 결정).

**주의**: 이 커밋은 `origin/frontend`에서 PR #63(전송계층·인증 가드) **이전** 시점 기준이다.
그래서 인증·라우팅·전송계층 관련 파일은 전부 지금 것(PR #63 이후, T9까지 반영된 것)이 더 최신이고
우세하다 — 아래 §2 참고.

## 1. 현재 브랜치 상태

- 브랜치: `feature/link-backend-followup` (origin/frontend 최신에서 새로 판 것, 2026-08-26)
- **아직 커밋 하나도 안 함** — 전부 워킹트리 변경/스테이징 상태(`git status`로 확인)
- `local/frontend-e2e`(예전 스크래치 브랜치)의 미커밋 WIP는 `git stash list`에 stash로 보존돼 있음 —
  이 작업과 무관, 건드리지 않음
- T9(로그인 쿠키 왕복 확인)·T11(CI 빌드 게이트)·사설 LAN http 예외까지는 이 세션에서 이미 끝내고
  4게이트 통과 확인함(`frontend/docs/architecture/integration-status.md` 참고) — **이 스캐폴드
  통합 작업은 그 이후에 시작한 별개 단계**이고, 시작한 뒤로 아직 4게이트를 한 번도 안 돌렸다.

## 2. 이번 세션에서 확정된 결정들

| 항목 | 결정 | 근거 |
|---|---|---|
| 로그인/가입 화면 | **지금 것(팀원 PR #63 + 이 세션 T9) 유지, 스캐폴드 버전 제외** | 스캐폴드가 더 구버전 |
| 인증 가드(`_authed`/`_shell`) | **지금 것 유지** | 스캐폴드는 PR #63 이전이라 이 가드 자체가 없음(독자적인 다른 가드 방식을 씀 — `entities/auth`+`auth-cache.ts`, `user.has_wedding` snake_case — 전부 폐기 대상) |
| `shared/api/client.ts` | **지금 것 유지** | 스캐폴드 자체 `http`/`openSse` 클라이언트는 테스트 없는 구버전 |
| `entities/session` vs 스캐폴드 `entities/auth` | **`entities/session` 유지, `entities/auth`는 통째로 제외** | 위와 동일 사유 |
| FOCUS 배지 | `DashboardCategoryOut.tier: enum(FOCUS|MOCKUP)` 필드를 그대로 씀(하드코딩 숨김 아님) | 처음엔 "백엔드에 필드 없다"고 잘못 판단했다가 정정함 |
| 체크리스트 진행률 표시 | 개수(3/5) 대신 **비율(%)**로 — `checklistProgress: number`(0~1) 로 타입 통합 | API가 `progress_rate`(비율)만 주고 정확한 개수는 안 줌. S5 `CompletionRow.tsx`도 이미 비율로만 씀 |
| S6 예산 재배분 | **서버 호출 포함**(`PUT /wedding-categories`, `PATCH /weddings/me`) — HANDOFF.md의 "완전 클라이언트사이드" 스펙은 낡은 것 | 스캐폴드 주석이 "2026-08-24 사용자 지시 — 총예산도 변경 가능해야 한다"를 인용, 이 세션에서 재확인 완료 |
| 사설 LAN http 허용 | `checkApiBase()`에 RFC1918 예외 추가(로컬 개발 편의) + 배포 게이트(`isLocalOnlyApiBase`)는 LAN도 차단하도록 확장 | 같은 와이파이 다른 기기 테스트용, TLS는 안 세움(로컬은 http, 배포만 https) |

## 3. 재사용성 조사 결과 요약 (병렬 서브에이전트 3건, 이 세션에서 완료)

- **entities**: `timeline`·`vendor-case`(import만 수정)·`checklist`(import + PATCH 응답 타입 버그)·
  `dashboard`(import + `tier`/`priority` 필드 수정) — **재사용 가능, 대부분 완료(§4 참고)**.
  `payment`는 PR #58(영수증 OCR) 이전이라 **전면 재작성 필요**. `wedding/api`는 import 수정 +
  기존 `entities/wedding/model/types.ts`와 **수동 병합 필요**(현재 브랜치에 이미 다른 타입들이
  있음 — `BudgetSummary`/`CategoryBudget`/`UpcomingPayment`/`WeddingHeadline`, 스캐폴드는
  `WeddingProfile`/`WeddingCreateInput` 등을 추가하려 함, 안 겹치므로 병합 자체는 단순 추가일 것).
  `chat`은 이벤트 스펙은 정확하지만 **SSE 전송(`openSse`) 자체를 현재 `apiBase()`/credentials
  패턴으로 재작성해야 함** — 가장 손이 많이 감.
- **온보딩 8단계**(`pages/onboarding/ui/steps/*`): **신뢰도 높음** — `12_final_prototype_mockup.html`
  기준으로 2026-08-24에 재검증됐고, 실제 422 버그(ENUM 불일치) 2건을 근거로 필드가 고쳐져 있음.
  `GeneratingOverlay.tsx`도 `POST /weddings`가 동기(개인화 생성까지 대기)라는 걸 백엔드 코드
  (`backend/app/services/wedding.py:139`)를 인용해 정확히 반영. **판정: 수정 후 재사용**(import만).
- **S3/S4/S5/S3챗**: **as-is 재사용 가능**. 특히 채팅은 `FRONTEND_LOCAL_FIXES_HANDOFF.md`가
  포팅해달라던 버그 수정(StrictMode 중복 방지 락, `whitespace-pre-wrap`, stage/retry UI)이 이미
  다 들어있음.
- **S6**: 위 §2 결정대로 as-is(서버 호출 포함 버전 채택 확정).

## 4. DONE — 이 세션에서 실제로 끝난 것

### T9/T11/LAN (스캐폴드 통합과 별개, 먼저 끝낸 것)
- `src/pages/login/ui/{LoginPage.tsx,LoginPage.test.tsx}` — 로그인 후 `getMe()` 쿠키 왕복 프로브 + `RATE_LIMIT_EXCEEDED` 에러 매핑
- `public/staticwebapp.config.json` — CSP `connect-src`에 staging 백엔드 오리진 추가
- `.github/workflows/frontend-ci.yml` — Build 스텝 포크 PR 분기
- `src/shared/api/api-base.ts`(+`.test.ts`) — 사설 LAN http 예외, `isLoopbackApiBase`→`isLocalOnlyApiBase` 개명·확장
- `src/shared/api/index.ts`, `vite.config.ts` — 위 개명 반영
- `scripts/check-bundle-budget.mjs` — 번들 예산 96,000→96,100→96,300(실측과 함께)
- `.env.example` 포트 8001, `docs/architecture/{backend-integration,integration-status}.md` 갱신

### 스캐폴드 이식 (이번 작업)
- **순수 신규 파일 이식 완료**(`git checkout 8fa76f0 -- <path>`로 가져온 원본 그대로, 아직 import
  안 고친 것 포함):
  `entities/{chat,payment,timeline,vendor-case}/*`, `entities/wedding/api/wedding.ts`,
  `shared/lib/money.ts`, `pages/onboarding/ui/{GeneratingOverlay.tsx,onboarding-styles.ts,steps/*}`,
  `pages/chat/*`, `pages/category/ui/{ChecklistTab,CostTab,AddPaymentRow}.tsx`,
  `pages/budget/ui/CategoryAllocationRow.tsx`, `pages/timeline/ui/{TimelineItemRow.tsx,group-by-phase.ts}`,
  `pages/report/ui/adapt-report.ts`, `pages/dashboard/ui/adapt-summary.ts`
- **import + 필드 수정까지 완료**:
  - `entities/timeline/api/timeline.ts` — `http`→`apiFetch`, `/api/v1` 접두사
  - `entities/vendor-case/api/vendor-case.ts` — 〃
  - `entities/checklist/model.ts` — `ChecklistItemPatchResponse`(4필드) 타입 신설
  - `entities/checklist/api/checklist.ts` — `http`→`apiFetch`, `patchChecklistItem` 반환 타입을 위 타입으로 수정
  - `entities/checklist/index.ts` — 새 타입 재수출
  - `entities/dashboard/model.ts` — `tier`에서 근거 없는 `"CUSTOM"` 제거(`FOCUS|MOCKUP` 2값으로),
    `ReportRecommendedCheck.priority`를 지어낸 3값 union에서 `string`으로

## 5. TODO — 남은 작업 (이 순서 권장)

1. **`entities/dashboard/api/dashboard.ts`** — import만 남음(`http`→`apiFetch`, `/api/v1` 접두사). model.ts는 이미 고쳤음.
2. **`entities/wedding/api/wedding.ts`** — import 수정 + `entities/wedding/model/types.ts`(기존 파일)에
   스캐폴드의 `WeddingProfile`/`WeddingCreateInput`/`WeddingUpdateInput`/`WeddingCategoriesResponse`/
   `WeddingCategoryUpdateInput`/`TotalAverageBenchmark`/`CategoriesResponse` 타입들을 병합(기존
   `BudgetSummary` 등과 이름 충돌 없는지 먼저 확인). `entities/wedding/index.ts`도 새 export 반영.
3. **`entities/payment/*`** — 전면 재작성. `PaymentCreateInput`에 `paid_date`/`receipt_url` 추가,
   `PaymentStatus`를 좁은 union이 아니라 `string`으로(문서: "자유 문자열, 검증 없음"), `POST
   /payments/receipt-extract` multipart 엔드포인트 신설(`apiFetchMultipart` 사용, S4 영수증 OCR용).
4. **`entities/chat/api/chat.ts`** — `openSse`를 현재 `apiBase()`+`credentials:"include"` 패턴으로
   재작성. 이벤트 파싱 로직(`dispatchSseFrame` 등) 자체는 스캐폴드 것을 그대로 가져다 써도 됨(정확함
   — 이미 검증됨). `entities/chat/ui/ChatPanel.tsx`도 이 재작성된 함수를 쓰도록 import 확인.
5. **`pages/category/ui/{ChecklistTab,CostTab,AddPaymentRow}.tsx`** — `@/shared/api/client`(`ApiError`
   import) → `@/shared/api`로 경로만 수정.
6. **각 페이지 실제 배선** — 지금은 파일만 복사돼 있고 화면 자체(`CategoryPage.tsx`/`DashboardPage.tsx`/
   `OnboardingPage.tsx`/`BudgetPage.tsx`/`TimelinePage.tsx`/`ReportPage.tsx`)는 여전히 스텁/샘플데이터.
   스캐폴드 커밋의 이 파일들 diff(`git show 8fa76f0 -- frontend/src/pages/{category,dashboard,onboarding,budget,timeline,report}/ui/*Page.tsx`)를
   참고해서 지금 버전에 실제로 새 조각들을 연결.
   - `DashboardPage.tsx`: `entities/dashboard`의 `getDashboardSummary()` + `adapt-summary.ts`로 실데이터 wiring, `CategoryRow.tsx`의 `checklistDone/checklistTotal`을 `checklistProgress`로 교체(§2 결정), FOCUS 배지는 `tier==="FOCUS"`로.
   - `OnboardingPage.tsx`: Step1~8 위저드 + GeneratingOverlay 연결, 제출 성공 시 세션 캐시 무효화(`invalidateSession()`, 현재 `entities/session` 것 사용) 후 `/` 이동.
   - `CategoryPage.tsx`: 탭 3개(체크리스트/비용/AI상담) 연결.
   - `BudgetPage.tsx`: S6 재배분(서버 호출 포함, §2 결정대로).
   - `TimelinePage.tsx`: `group-by-phase.ts` 연결.
   - `ReportPage.tsx`: `adapt-report.ts` 연결.
7. **`app/router/router.tsx` / `app/ui/AppShell.tsx` / `app/ui/NavItem.tsx`** — **통째로 덮지 말고
   수동으로 이 2가지만 추가**:
   - `/chat` 라우트(`chatRoute`, `lazyRouteComponent(() => import("@/pages/chat"), "ChatPage")`) +
     `PRIMARY_NAV`에 항목 추가 + `NavTarget` 타입에 `"/chat"` 추가 + `IconChat` (스캐폴드 diff:
     `git diff b0b3137 8fa76f0 -- frontend/src/app/router/router.tsx frontend/src/app/ui/AppShell.tsx frontend/src/app/ui/NavItem.tsx` 참고)
   - 로그아웃 버튼(스캐폴드 `LogoutButton` 마크업 재사용, 단 배선은 `entities/auth`가 아니라 지금
     `entities/session`의 `logout()`+`invalidateSession()`으로)
   - 로그인/온보딩 라우트의 `beforeLoad`/`React.lazy` 패턴은 **포팅하지 않는다** — 지금 `_authed`/
     `_shell` 가드와 지금 `LoginPage.tsx`(콜백 prop 없이 자체 `useNavigate` 사용) 방식이 이미 다름.
8. **4게이트 전부 재확인**(`npm run typecheck && npm run lint && npm test && npm run build`) —
   스캐폴드 통합 시작 이후 한 번도 안 돌렸다. 번들 예산이 다시 걸릴 가능성 높음(화면 5개 추가) —
   `scripts/check-bundle-budget.mjs`의 기존 패턴대로 실측과 함께 올릴 것, 새 화면은 lazy 유지.
9. 전부 끝나면 커밋 여부/범위를 사용자에게 확인.

## 6. 그 밖에 기억해둘 것

- **`dev-e4`**(같은 머신의 다른 Claude 세션, 백엔드 담당)와 이 세션 사이에 CORS/쿠키 Secure 플래그/
  LAN 오리진 관련 협업이 있었다 — `backend/app/main.py`(CORS 오리진에 LAN IP 추가)와
  `backend/app/core/config.py`/`auth.py`(`SESSION_COOKIE_SECURE` 옵션화)에 **로컬 미커밋 수정이
  들어가 있음**(backend/는 이 브랜치 소유 경로가 아니라 커밋 안 함 — 영구 반영하려면 별도
  `feature/backend-*` PR 필요, dev-e4가 만들어줄 수 있다고 했음).
- `frontend/.env`는 `VITE_API_BASE=http://192.168.45.191:8001`(LAN, 경로 없음)로 맞춰져 있음 —
  다른 기기 테스트용. 이 파일은 gitignore 대상이라 커밋 안 됨, 이 로컬 환경에만 존재.
- 이 저장소 CLAUDE.md 규칙: 실제 코드 작성/수정은 병렬 서브에이전트로 쪼개지 않고 항상 단일
  스레드(메인 세션)로 — 조사/리서치만 병렬 가능.

## 7. 완료 상태 (2026-08-26, 이 세션 종료 시점)

§5 TODO 1~9 전부 완료. 4게이트(`npm run typecheck && npm run lint && npm test && npm run build`)
전부 통과 확인 후 커밋 `5802512`("feat(frontend): 스캐폴드 6개 화면을 실API로 통합한다", 79 files
changed)로 `feature/link-backend-followup`에 반영 — **push는 안 함**(사용자 지시, 로컬 커밋만).
과정에서 실제로 고친 것들:
- `PaymentType`에 존재하지 않던 `"FULL"` 값을 백엔드 실제값 `"ETC"`로 수정(AddPaymentRow.tsx/
  CostTab.tsx 라벨도 함께).
- `PaymentStatus`를 인계 문서 최초 지침("자유 문자열")이 아니라 백엔드 실제 스키마
  (`backend/app/schemas/common.py`의 `Literal["PLANNED","PAID","CANCELED"]`, Pydantic 검증
  대상)에 맞춰 3값 union으로 정정 — 이 파일에 문서 지침과 실제 코드가 어긋난 사례로 남겨둔다.
- 체크리스트 진행률을 `checklistDone`/`checklistTotal`(개수 위장) 대신 `checklistProgress`
  (0~1 비율)로 통일(§2 결정 실제 적용) — `entities/wedding/model/types.ts`의 `CategoryBudget`,
  `dashboard/adapt-summary.ts`, `report/adapt-report.ts`, `CompletionRow.tsx`, `CategoryRow.tsx`
  전부 갱신, 더는 안 쓰는 `sample-data.ts`/`recommended-checks.ts` 삭제.
- 빌드 게이트가 잡은 회귀 3건: `bg-ink/40`(이 저장소가 아직 지원 안 하는 반투명 색, decisions.md
  D7 참고 → `GeneratingOverlay.tsx`를 불투명 배경으로 교체), `rounded`/`italic` bare 유틸리티
  (ghost-candidates.test.mjs가 소스뿐 아니라 **설명 주석의 평문도** 스캐너 후보로 잡는다는 걸
  두 번 겪음 — 주석에 클래스 이름을 그대로 적지 말 것).
- 번들 예산(`jsGzip`)을 실측 139,702B 기준 139,800으로 재설정(`scripts/check-bundle-budget.mjs`).

## 8. 온보딩 S1/S2 피드백 3건 — 완료(2026-08-26, 세션 재개 후)

사용자가 화면마다 실제로 대화하며 다듬어 나가겠다고 했다 — 아래는 그 첫 라운드로 온보딩 S1/S2에서
나온 구체적 피드백 3건. **아래 3건 전부 반영 완료**, 4게이트(`typecheck`·`lint`·`test`·`build`)
전부 통과 확인. 커밋은 아직 안 함 — 범위/시점은 사용자 확인 후.

> **주의**: 브라우저 자동화(chrome-devtools MCP)가 이 세션에서 연결되지 않아 코드 수정만 하고
> **실제 화면으로 시각 확인은 못 했다** — 다음에 실제로 화면을 열어볼 때 특히 1번(토글 라운드)을
> 눈으로 한 번 더 봐야 한다.

1. **S1(당신에 대해 알려주세요) "결혼 예정일" 토글 박스가 너무 둥글다.**
   `frontend/src/pages/onboarding/ui/onboarding-styles.ts:31-33`의 `MODE_TOGGLE_TRACK`/
   `MODE_TOGGLE_LABEL`/`MODE_TOGGLE_LABEL_ACTIVE`가 `rounded-pill`(스케일 중 가장 둥근 캡슐형)을
   쓴다 — `Step1RoleDate.tsx:74`에서 "정확한 날짜"/"아직 미정" 토글 트랙에 쓰인다(날짜 `<input>`
   자체는 이미 `rounded-md`, 문제 없음). `rounded-md`나 다른 스케일 토큰으로 낮추기 전에
   `MODE_TOGGLE_*`를 다른 곳에서도 쓰는지 먼저 확인.
   **✅ 완료** — `MODE_TOGGLE_*`가 `Step1RoleDate.tsx` 밖에서 안 쓰이는 걸 확인 후,
   트랙은 `rounded-md`, 라벨은 `rounded-sm`으로 낮췄다(날짜 `<input>`과 같은 단계).
2. **"반기"(하반기/상반기) 결정이 현재 날짜 기준 계산이 아니라 고정값이다.**
   `Step1RoleDate.tsx:22-27`의 `UNSURE_CHIPS`는 완전히 정적인 라벨 배열이고, 실제 문제 지점은
   `OnboardingPage.tsx`가 `unsurePrecision` 초기 state를 `useState<UnsurePrecision>
   ("APPROX_H1_NEXT_YEAR")`로 **하드코딩**한다는 것 — `new Date()` 기반 계산이 어디에도 없다.
   "오늘 기준 반년 뒤가 속한 반기"를 판정하는 순수 함수(예: `computeDefaultUnsurePrecision(today:
   Date): UnsurePrecision`, `shared/lib/`에 `money.ts`와 같은 패턴으로)를 만들어 그 초기값을
   대체해야 한다.
   **✅ 완료** — `shared/lib/wedding-date.ts`에 `computeDefaultUnsurePrecision(today: Date)`를
   추가(+테스트 `wedding-date.test.ts`). 정확히 +6개월 산술로는 「같은 해 하반기」/「다음 해
   상반기」 둘 중 하나만 나올 수 있어(달 인덱스 0~11의 산술적 귀결) 반환 타입을 그 2값으로
   좁혔다 — "내년 하반기" 칩 자체는 그대로 두고 기본값 후보에서만 뺐다.
   `OnboardingPage.tsx`의 `useState` 초기화를 `computeDefaultUnsurePrecision(new Date())`
   (지연 초기화 함수 형태)로 교체.
3. **S2(지역/예산) 지역 선택지가 14개 중 5개만 보인다.**
   `Step2RegionBudget.tsx:24-30`의 `REGION_OPTIONS`가 `SEOUL_GANGNAM`/`SEOUL_OTHER`/`GYEONGGI`/
   `INCHEON`/`BUSAN` 5개만 하드코딩돼 있다. `shared/api/contract.ts:13-17`의 `REGION_CODES`는
   17개(실제 지역 14개 + 폴백용 `NATIONWIDE`/`METRO`/`NON_METRO` 3개)를 갖고 있고, 사용자가 원하는
   건 폴백 3개를 뺀 지역 14개 전체 노출이다. 빠진 9개: `DAEGU`/`DAEJEON`/`GWANGJU`/`ULSAN`/
   `CHUNGCHEONG`/`JEOLLA`/`GYEONGSANG`/`GANGWON`/`JEJU` — 한국어 라벨을 새로 붙여야 한다.
   `REGION_OPTIONS`를 `REGION_CODES`에서 폴백 3개를 제외하고 파생시키는 방향을 검토.
   **✅ 완료** — `Step2RegionBudget.tsx`에서 `REGION_OPTIONS`를 `@/shared/api`의 `REGION_CODES`에서
   폴백 3개(`NATIONWIDE`/`METRO`/`NON_METRO`, `Set`으로 제외)를 뺀 나머지로 파생시키도록 바꿨다.
   9개 신규 지역 한국어 라벨(대구/대전/광주/울산/충청/전라/경상/강원/제주) 추가.
   `Step2Props`(`regionCode: string`)는 그대로 — 이 파일 내부 상수만 바뀌었다.
