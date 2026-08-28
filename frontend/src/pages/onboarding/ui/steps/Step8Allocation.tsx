// 8단계(분리됨): 카테고리별 예산 배분. 시각 스펙 s1-onboarding.html:348-378의 금액 입력 부분만 —
// 토글(무엇을 켤지)은 7단계(Step7CategoryToggle.tsx)로 분리했다. 분리 근거는 그 파일 머리말 참조.
//
// 이 스텝은 7단계가 남긴 **활성 카테고리만** 보여준다(12_final_prototype_mockup.html의 onbStep8
// 이 `CATEGORY_META.filter(active)`로 하는 것과 동일) — 꺼둔 카테고리는 배분할 금액 자체가
// 의미 없으므로 여기 나타나지 않는다.
//
// **막대(slider)는 숫자 입력을 대체하지 않고 같이 쓴다(2026-08-26 사용자 지시).** 숫자 입력은
// 정확한 금액을 바로 타이핑하고 싶을 때, 막대는 감으로 빠르게 조절하고 싶을 때 — 서로 다른
// 입력 습관을 둘 다 지원한다. 둘 다 같은 `plannedBudget` 상태를 공유하므로 어느 쪽으로 바꿔도
// 즉시 반영된다. 막대 조절 단위는 10만원(2026-08-26 사용자 지시) — 클수록 조작이 거칠어지지만,
// 예식 예산 규모(수백~수천만원)에서 만원 단위 세밀 조정은 막대로는 오히려 부정확하다.
//
// ## 초과 배분을 여기서 막는다 (2026-08-28 사용자 지시)
//
// 예전엔 배분 합계가 총예산을 넘어도 아무것도 막지 않았다 — "N원 초과"라는 텍스트 한 줄만
// 바뀌고 "다음"은 그대로 통과했다. 그 값이 그대로 `POST /weddings` 의 `planned_budget` 으로
// 나가 서버가 **400 BUDGET_EXCEEDED** 를 냈고(`sum(planned_budget) > total_budget`,
// backend services/wedding.py:300), 사용자는 온보딩을 끝까지 채우고 "시작하기"를 눌러야
// 비로소 그 사실을 알았다. 게다가 10단계 확인 화면은 "5,000만원 / 4,000만원"으로 나란히 찍을 뿐
// "초과"라는 말조차 하지 않아, 배너를 보고도 어디를 고쳐야 하는지 알 수 없었다.
//
// 이제 세 가지가 이 화면 안에서 끝난다:
//   1. 초과면 부모가 "다음"을 막는다(OnboardingPage — 술어 `isOverAllocated` 를 부모가 소유하고
//      이 컴포넌트는 prop 으로 받는다. 막는 조건과 문구를 띄우는 조건이 갈리면 안 된다).
//   2. 카드 아래에 이유와 함께 **총예산을 올리는 길**을 준다 — 2단계로 되돌아가지 않아도 된다.
//   3. 그 길을 누르면 상단 요약 카드가 아래로 펼쳐지며 2단계와 **같은 입력 컴포넌트**
//      (`TotalBudgetField`)가 열린다. 마크업을 복사하지 않는 이유는 그 파일 머리말에 있다.
import { useEffect, useRef, useState } from "react";
import type { AllocationRow } from "./Step7CategoryToggle";
import { AMOUNT_STEP_MANWON, manwonToWon, wonToManwon } from "@/shared/lib/money";
import { IconChevronDown, NumberInput } from "@/shared/ui";
import { FIELD_NOTE } from "../onboarding-styles";
import { TotalBudgetField } from "./TotalBudgetField";

const ROW = "flex flex-col gap-2 border-b border-line py-3 last:border-b-0 last:pb-0 first:pt-0";
const TOP_ROW = "flex items-center gap-2.5";
const AMOUNT_INPUT =
  "min-h-tap w-28 rounded-md border border-line bg-surface px-2.5 text-right text-base text-ink " +
  "[font-variant-numeric:tabular-nums] focus-visible:border-primary";
const SLIDER = "h-1.5 w-full cursor-pointer accent-primary";

// 총예산 표시 겸 펼침 트리거. py-1 로 히트 영역을 24px 쪽으로 넓힌다(WCAG 2.5.8 AA) —
// 글자 크기는 그대로 두고 클릭 가능 높이만 키우는 이 수법의 선례는 Step2RegionBudget.tsx 의
// MINI_TOGGLE 이다.
const DISCLOSURE = "flex items-center gap-1 py-1 text-xs text-ink-soft transition-colors duration-150 hover:text-primary";
// ⚠️ 조건부로 조립하지 않고 **완성된 리터럴 두 개 중 하나를 그대로 고른다**(onboarding-styles.ts
// 머리말과 같은 근거) — Tailwind 스캐너는 소스를 평문으로 읽어 런타임 조립을 찾지 못하고,
// 빌드는 성공한 채 스타일만 조용히 사라진다.
const CHEVRON = "transition-transform duration-150";
const CHEVRON_OPEN = "rotate-180 transition-transform duration-150";

// 펼침 애니메이션 — `grid-template-rows: 0fr ↔ 1fr`.
//
// **왜 max-height 가 아닌가** — 높이를 모르는 콘텐츠를 `height: auto` 로 전환할 수 없어서 흔히
// `max-height` 에 넉넉한 상수를 주는데, 그러면 (a) 콘텐츠가 그 값을 넘으면 잘리고 (b) 실제
// 높이보다 큰 거리를 같은 시간에 달려 이징이 끝부분에서 뚝 끊긴 것처럼 보인다. `0fr → 1fr` 은
// 실제 콘텐츠 높이를 브라우저가 알아서 잡으므로 매직 넘버가 없다.
//
// 안쪽 래퍼의 `overflow-hidden` 은 장식이 아니라 **이 수법의 필수 조건**이다 — 그리드 아이템의
// 자동 최소 크기(min-height: auto)가 콘텐츠 높이 아래로 못 줄어들게 막는데, `overflow: hidden`
// 이 그 최소값을 0으로 바꾼다. 빼면 접힌 상태에서도 높이가 그대로 남는다.
//
// `prefers-reduced-motion` 은 따로 처리하지 않는다 — styles.css 의 전역 규칙이
// `transition-duration` 을 0.01ms 로 덮어 즉시 열리고 닫힌다(그게 그 환경에서 원하는 동작이다).
// 크기 전환이라 duration-200 — 색 전환(150)과 구분하는 이 저장소의 관례다(Progress.tsx).
//
// ## `-mx-4` — 포커스 링이 잘리지 않게 하는 짝 (사용자 신고, 2026-08-28)
//
// 위 `overflow-hidden` 은 높이만 자르는 게 아니라 **박스 밖으로 나가는 것을 전부** 자른다.
// styles.css 의 `:focus-visible` 규칙은 2px 선을 2px 띄워 그리므로 포커스 링이 요소 밖으로
// 4px 뻗는데, 입력칸이 클리퍼의 왼쪽 끝에 붙어 있고 아래쪽도 클리퍼의 끝이라 그 4px 이 잘려
// 나갔다 — 실제로 "좌측과 하단이 카드 틀에 잘린다"고 보고된 증상이다.
//
// ⚠️ 이 주석에 그 CSS 속성 이름을 평문으로 적지 않는다 — Tailwind 스캐너는 파일 전체를 평문으로
// 훑어 주석 속 단어 하나를 그대로 유틸리티 후보로 만든다. 실제로 이 수정의 첫 커밋이 그 단어를
// 적었다가 유령 후보 게이트(ghost-candidates.test.mjs)에 잡혔다. 같은 사고의 선례가
// BudgetDonut.tsx · onboarding-styles.ts 머리말에도 적혀 있다.
//
// 그래서 **클리퍼를 카드 패딩(p-4)만큼 바깥으로 흘리고**(`-mx-4`) **안쪽 콘텐츠를 같은 값만큼
// 되돌려 넣는다**(`mx-4`, 아래 PANEL_CONTENT). 결과: 입력칸의 왼쪽 끝은 카드 콘텐츠 경계에
// 그대로 맞고(정렬이 어긋나지 않는다), 그 왼쪽으로 16px 의 잘릴 여유가 생긴다.
// 콘텐츠에 `px-1` 만 주는 쪽이 간단하지만 그러면 입력칸이 위쪽 문구들보다 4px 안으로 들어가
// 잘림을 정렬 어긋남과 맞바꾸는 셈이 된다.
//
// ⚠️ **아래쪽은 같은 수법을 쓸 수 없다.** `-mb-4` 를 걸면 접혔을 때(높이 0) 그 음수 마진이
// 그대로 남아 카드의 아래 패딩을 먹는다. 아래는 콘텐츠 안쪽 `pb-1.5`(6px > 4px)로 확보한다 —
// 접히면 클리퍼 안이라 같이 잘려 사라지므로 접힌 모양에는 영향이 없다.
const PANEL_OPEN = "-mx-4 grid grid-rows-[1fr] transition-[grid-template-rows] duration-200";
const PANEL_CLOSED = "-mx-4 grid grid-rows-[0fr] transition-[grid-template-rows] duration-200";
/** 흘려보낸 만큼 되돌려 넣는 짝(`mx-4` ↔ `-mx-4`) + 포커스 링 하단 여유(`pb-1.5`). */
const PANEL_CONTENT = "mx-4 mt-3 border-t border-line pt-3 pb-1.5";

const OVER_TITLE = "text-sm font-bold text-primary";
// 링크가 아니라 화면 안 동작이라 <button> 이다. 밑줄은 "누를 수 있다"를 색 말고도 전달한다
// (D6 — 상태색만으로 의미를 싣지 않는다). min-h-tap 으로 44px 타겟을 지킨다.
const OVER_CTA = "min-h-tap w-fit text-left text-sm font-bold text-primary underline";

// 초과 문구가 들고 날 때의 전환 — 위 패널과 달리 `grid-rows` + `overflow-hidden` 을 쓰지 않는다.
//
// **낭독을 지켜야 하기 때문이다.** 이 블록은 라이브 리전(<output>) 안에 있고, 스크린리더는
// 리전 **안에서 실제로 일어난 변화**를 보고 읽는다. `overflow-hidden` + 높이 0 방식은 내용이
// 계속 접근성 트리에 남아 있어 변화가 없다 — 애니메이션을 얻는 대신 "초과했어요" 낭독을 잃는다.
// `display` 를 토글하면 내용이 트리에서 실제로 들고 나므로 리전이 예전처럼 읽어 준다.
// 탭 순서에서 빠지는 것도 브라우저가 알아서 해준다(`inert` 를 따로 걸 필요가 없다).
//
// `display` 는 이산(discrete) 속성이라 원래 전환되지 않는다. `transition-discrete`
// (`transition-behavior: allow-discrete`)가 **사라질 때** `display:none` 적용을 전환이 끝난
// 뒤로 미루고, `starting:opacity-0`(`@starting-style`)이 **나타날 때** 시작 불투명도를 준다 —
// 이 둘이 있어야 양방향 모두 부드럽다. 지원하지 않는 브라우저에서는 그냥 즉시 나타났다
// 사라진다(지금 동작) — 깨지지 않는다.
//
// 높이까지 접지 않고 페이드만 하는 이유 — 이 블록은 화면 맨 아래라 아래로 밀려날 콘텐츠가 없고,
// 여기서 `overflow-hidden` 을 쓰면 CTA 버튼의 포커스 링이 또 잘린다(위 PANEL_* 주석의 그 사고).
// 🚨 **두 리터럴은 display 와 opacity 만 달라야 한다**(사용자 신고, 2026-08-28 — "미초과로 바뀔 때
// 버벅거리며 사라진다"). `allow-discrete` 가 적용을 미뤄 주는 것은 `display` **하나뿐**이다.
// 처음엔 숨김 쪽에서 `mt-4 flex-col gap-1.5` 를 같이 뺐는데, 그러면 사라지는 200ms 동안 요소는
// 아직 `display:flex` 인 채로 `flex-direction` 이 row 로, `gap` 이 0 으로, 위 여백이 0 으로 **즉시**
// 튄다 — 세 줄이 가로로 뭉치며 위로 16px 점프한 뒤에야 페이드가 돈다. 그게 그 버벅거림이었다.
// 레이아웃 값은 양쪽에 똑같이 적어 둔다(숨은 동안에는 display:none 이라 아무 영향이 없다).
//
// `flex` 만 예외로 한쪽에만 둔다 — `hidden` 과 `flex` 는 둘 다 display 유틸리티라 어느 쪽이
// 이기는지가 클래스 나열 순서가 아니라 산출 CSS 순서로 정해진다. 한 요소에 둘을 같이 얹지 않는다.
// (`flex-col`·`gap-*` 은 display 유틸리티가 아니라 충돌하지 않는다.)
const OVER_SHOWN =
  "mt-4 flex flex-col gap-1.5 opacity-100 transition-[opacity,display] transition-discrete duration-200 starting:opacity-0";
const OVER_HIDDEN =
  "mt-4 hidden flex-col gap-1.5 opacity-0 transition-[opacity,display] transition-discrete duration-200";

const BUDGET_STEP_WON = 100_000; // 10만원 단위
// 만원 단위 스텝은 shared 로 올라갔다 — 예산 페이지의 슬라이더(CategoryAllocationRow)와
// 총예산 인라인 수정(BudgetDonut)이 같은 값을 써야 하는데, 여기 사문 상수로 두면 갈린다.

/** 펼침 트리거(`aria-controls`)와 펼쳐지는 패널을 잇는다. 이 화면에 하나뿐이라 상수로 둔다. */
const BUDGET_PANEL_ID = "onboarding-step8-total-budget";

export interface Step8Props {
  rows: AllocationRow[];
  onRowsChange: (rows: AllocationRow[]) => void;
  totalBudgetEstimate: number;
  /**
   * 활성 카테고리 배분 합계(원). **여기서 다시 더하지 않는다** — "다음" 게이트(OnboardingPage)와
   * 10단계 확인 라벨(build-review-labels)이 이미 이 값을 쓴다. 같은 합을 세 곳에서 따로 구하면
   * 하나만 고쳤을 때 조용히 어긋난다.
   */
  allocatedBudget: number;
  /**
   * `allocatedBudget > totalBudgetEstimate`. 파생 가능한 값이지만 prop 으로 받는다 —
   * 부모가 "다음"을 막는 조건과 이 화면이 초과 문구를 띄우는 조건은 **반드시 같은 술어**여야 한다.
   */
  isOverAllocated: boolean;
  /**
   * 인라인 수정으로 확정된 총예산을 부모 state 로 되돌린다(원 단위 문자열).
   * 부모는 이 호출을 받으면 "미정" 플래그도 함께 내린다 — 근거는 OnboardingPage 쪽 주석.
   */
  onTotalBudgetChange: (wonString: string) => void;
}

export function Step8Allocation({
  rows,
  onRowsChange,
  totalBudgetEstimate,
  allocatedBudget,
  isOverAllocated,
  onTotalBudgetChange,
}: Step8Props) {
  const activeRows = rows.filter((row) => row.isActive);
  const remaining = totalBudgetEstimate - allocatedBudget;
  const percent = totalBudgetEstimate > 0 ? Math.min(1, Math.max(0, allocatedBudget / totalBudgetEstimate)) : 0;

  const [isBudgetOpen, setIsBudgetOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // 펼쳐지면 카드를 화면 위로 올리고 입력에 포커스를 준다. 카드 아래 CTA(목록을 한참 스크롤해야
  // 닿는 자리)에서 열리는 경로가 주 용도라 스크롤이 없으면 "아무 일도 안 일어난 것"처럼 보인다.
  //
  // `behavior: "smooth"` 를 쓰지 않는다 — styles.css 의 전역 prefers-reduced-motion 규칙은
  // animation-duration/transition-duration 만 덮어 `scroll-behavior` 는 잡지 못한다. 기본값
  // (즉시 이동)이 그 환경에서 안전하다. 온보딩은 _shell 밖이라(router.tsx) 고정 상단바에
  // 가려질 걱정도 없다.
  //
  // 포커스까지 옮기는 이유 — 이 패널의 내용은 입력칸 하나뿐이고, 사용자가 방금 "총예산 금액을
  // 조정할까요?"를 눌러 여기 온 것이다. 트리거에 포커스를 남기면 키보드 사용자는 펼쳐진 칸을
  // 찾아 다시 Tab 해야 한다.
  useEffect(() => {
    if (!isBudgetOpen) return;
    cardRef.current?.scrollIntoView({ block: "start" });
    panelRef.current?.querySelector("input")?.focus();
  }, [isBudgetOpen]);

  function updateRow(categoryCode: string, plannedBudget: number) {
    onRowsChange(rows.map((row) => (row.categoryCode === categoryCode ? { ...row, plannedBudget } : row)));
  }

  return (
    <div className="flex flex-col gap-4">
      <div ref={cardRef} className="rounded-md border border-line bg-surface p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-base font-bold text-ink [font-variant-numeric:tabular-nums]">
            {allocatedBudget.toLocaleString("ko-KR")}원 배분됨
          </span>
          {/* 보이는 글자("/ 40,000,000원")가 무엇을 하는 버튼인지 말해 주지 않으므로 접근명을
              따로 준다. 보이는 문자열을 접근명이 포함하므로 WCAG 2.5.3(Label in Name)도 지킨다. */}
          <button
            type="button"
            className={DISCLOSURE}
            aria-expanded={isBudgetOpen}
            aria-controls={BUDGET_PANEL_ID}
            aria-label={`총예산 ${totalBudgetEstimate.toLocaleString("ko-KR")}원 수정`}
            onClick={() => {
              setIsBudgetOpen((open) => !open);
            }}
          >
            / {totalBudgetEstimate.toLocaleString("ko-KR")}원
            <IconChevronDown size={12} className={isBudgetOpen ? CHEVRON_OPEN : CHEVRON} />
          </button>
        </div>
        <div className="mb-1.5 h-1.5 overflow-hidden rounded-pill bg-line">
          <div className="h-full rounded-pill bg-primary" style={{ width: `${(percent * 100).toString()}%` }} />
        </div>
        {/* 이 숫자는 슬라이더를 끄는 동안 연속으로 바뀐다 — **라이브 리전에 넣지 않는다.**
            넣으면 스크린리더가 매 프레임 낭독한다. 초과 사실의 낭독은 카드 아래 <output> 블록이
            한 번만 맡는다. */}
        <p className="text-xs text-ink-soft">
          {remaining >= 0 ? `${remaining.toLocaleString("ko-KR")}원 남음` : `${Math.abs(remaining).toLocaleString("ko-KR")}원 초과`}
        </p>

        {/* 접힐 때도 애니메이션이 돌려면 **마운트를 유지해야 한다** — 조건부 렌더로 떼어내면
            나갈 프레임이 없어 그냥 사라진다. 대신 접힌 동안 `inert` 를 걸어 탭 순서와 접근성
            트리에서 모두 빼낸다. 안 걸면 화면에 보이지도 않는 입력칸에 Tab 으로 들어가고,
            스크린리더가 "총 예산 편집" 을 읽는다(높이 0으로 잘렸을 뿐 DOM 에는 그대로 있다). */}
        <div id={BUDGET_PANEL_ID} className={isBudgetOpen ? PANEL_OPEN : PANEL_CLOSED}>
          <div ref={panelRef} className="overflow-hidden" inert={!isBudgetOpen}>
            {/* 여백·구분선을 바깥이 아니라 여기 두는 이유 — overflow-hidden 안쪽이라야 접혔을 때
                같이 잘린다. 바깥에 두면 접힌 상태에서도 24px 짜리 빈 줄과 선이 남는다. */}
            <div className={PANEL_CONTENT}>
              {/* "미정이에요" 토글과 지역 평균 안내 문구는 뺀다(2026-08-28 사용자 지시) — 여기서
                  금액을 직접 넣는다는 것 자체가 "미정이 아니다"라는 뜻이고, 지역 시세는 이미
                  2단계에서 봤다. 부모가 이 호출을 받으면 미정 플래그를 내린다. */}
              <TotalBudgetField
                onTotalBudgetChange={onTotalBudgetChange}
                // 분모(`totalBudgetEstimate`)를 그대로 보여준다 — 이미 "미정이면 벤치마크, 아니면
                // 사용자 입력값"이 반영된 값이라 여기서 다시 분기할 것이 없다. 0(=사용자 미입력 +
                // 벤치마크 조회 실패)일 때만 빈 칸으로 — 0을 채우면 "0원으로 시작한다"는 거짓말이
                // 된다(Step2RegionBudget.tsx의 benchmarkManwon과 같은 근거).
                valueManwon={totalBudgetEstimate > 0 ? wonToManwon(totalBudgetEstimate) : null}
              />
            </div>
          </div>
        </div>
      </div>

      <div>
        {activeRows.map((row) => {
          // 슬라이더 상한 — 총예산보다 이미 더 배분돼 있으면(초과 상태) 그 값까지는 보여줘야
          // 막대가 현재 값을 못 담고 잘리지 않는다.
          const sliderMax = Math.max(totalBudgetEstimate, row.plannedBudget, BUDGET_STEP_WON);
          return (
            <div key={row.categoryCode} className={ROW}>
              <div className={TOP_ROW}>
                <span className="flex-1 text-sm font-bold text-ink">{row.nameKo}</span>
                {row.hasCost ? (
                  <div className="flex flex-none items-center gap-1.5">
                    <NumberInput
                      className={AMOUNT_INPUT}
                      min={0}
                      step={AMOUNT_STEP_MANWON}
                      aria-label={`${row.nameKo} 예산 금액`}
                      // 행 배열 자체는 원 단위를 유지한다(합계·진행률 계산이 이미 원 단위로 짜여
                      // 있다) — 만원 변환은 이 입력의 표시/입력 경계에서만 일어난다.
                      value={wonToManwon(row.plannedBudget)}
                      // 이 행은 슬라이더와 값을 공유해 "빈 칸"을 담을 수 없다 — null 은 0으로
                      // 접는다. 지운 직후의 빈 칸 표시는 NumberInput 이 스스로 지킨다(그쪽 주석).
                      onValueChange={(next) => {
                        updateRow(row.categoryCode, manwonToWon(next ?? 0));
                      }}
                    />
                    <span className="text-xs font-bold text-ink-soft">만원</span>
                  </div>
                ) : (
                  <span className="flex-none text-xs text-ink-soft">비용 없음</span>
                )}
              </div>
              {row.hasCost && (
                <input
                  type="range"
                  className={SLIDER}
                  min={0}
                  max={sliderMax}
                  step={BUDGET_STEP_WON}
                  value={row.plannedBudget}
                  aria-label={`${row.nameKo} 예산 조절`}
                  onChange={(event) => updateRow(row.categoryCode, Number(event.target.value))}
                />
              )}
            </div>
          );
        })}

        {/* **리전 자체는 항상 이 자리에 있고, 안쪽 블록만 들고 난다** — 조건부로 리전을 통째로
            마운트하면 스크린리더가 그 등장을 놓치는 경우가 많다(라이브 리전은 "이미 존재하는
            노드 안에서 일어난 변화"를 본다). display 토글은 그 변화를 실제로 만들어 낸다.
            assertive(alert)가 아니라 polite인 이유 — 슬라이더를 끄는 동안 문구가 나타났다
            사라지므로, assertive면 진행 중인 낭독을 계속 끊는다.
            `role="status"` 를 붙인 <div> 가 아니라 <output> 인 이유 — jsx-a11y(prefer-tag-over-role)가
            네이티브 태그를 요구한다(Page.tsx의 progressbar가 겪은 그 규칙). <output>의 암묵 role이
            정확히 status라 의미는 그대로다. 기본이 인라인이므로 flex를 직접 건다.
            **목록 <div> 안에 두는 이유** — 바깥 `flex flex-col gap-4` 의 형제로 두면 숨은 동안에도
            gap 16px 이 그대로 남아 목록 아래에 빈 줄이 생긴다. 대신 여백은 블록 자신의 `mt-4` 가
            내고, 숨으면 display:none 이라 그 여백도 함께 사라진다. */}
        <output className="flex flex-col">
          <div className={isOverAllocated ? OVER_SHOWN : OVER_HIDDEN}>
            <p className={OVER_TITLE}>설정한 예산이 총예산을 초과했어요.</p>
            <button
              type="button"
              className={OVER_CTA}
              onClick={() => {
                setIsBudgetOpen(true);
              }}
            >
              총예산 금액을 조정할까요?
            </button>
            {/* 지워진다는 사실을 **누르기 전에** 알린다. "나중에 설정"은 이 상태에서 배분 금액을
                전부 0으로 되돌리고 10단계로 간다(OnboardingPage.handleSkipToReview) — 조용히
                지우면 10단계에서 "0원 배분"을 보고 버그로 읽는다. */}
            <p className={FIELD_NOTE}>‘나중에 설정’을 누르면 배분한 금액이 모두 지워져요.</p>
          </div>
        </output>
      </div>
    </div>
  );
}
