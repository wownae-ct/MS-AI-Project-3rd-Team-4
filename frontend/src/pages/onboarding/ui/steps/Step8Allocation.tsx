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
import { DisclosurePanel, IconChevronDown, NumberInput, StatusCallout } from "@/shared/ui";
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

// 펼침 패널(`DisclosurePanel`)과 초과 안내 블록(`StatusCallout`)은 2026-08-29에 shared/ui 로
// 올라갔다 — 예산 재배분 화면(S6)이 같은 장치를 쓰는데 pages 슬라이스끼리는 import 할 수 없어서다.
// 높이 전환·`inert`·포커스 링 잘림 방지·양방향 페이드의 불변식과 그 근거(전부 실제로 한 번씩
// 깨졌던 것)는 두 파일의 머리말로 함께 옮겼다.

const OVER_TITLE = "text-sm font-bold text-primary";
// 링크가 아니라 화면 안 동작이라 <button> 이다. 밑줄은 "누를 수 있다"를 색 말고도 전달한다
// (D6 — 상태색만으로 의미를 싣지 않는다). min-h-tap 으로 44px 타겟을 지킨다.
const OVER_CTA = "min-h-tap w-fit text-left text-sm font-bold text-primary underline";

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

  // 펼쳐지면 카드를 화면 위로 올린다. 카드 아래 CTA(목록을 한참 스크롤해야 닿는 자리)에서
  // 열리는 경로가 주 용도라 스크롤이 없으면 "아무 일도 안 일어난 것"처럼 보인다.
  // (입력칸 포커스는 `DisclosurePanel` 이 스스로 한다 — 스크롤 목적지인 이 카드는 그 패널
  // 바깥이라 여기서만 알 수 있어 둘로 나뉜다.)
  //
  // `behavior: "smooth"` 를 쓰지 않는다 — styles.css 의 전역 prefers-reduced-motion 규칙은
  // animation-duration/transition-duration 만 덮어 `scroll-behavior` 는 잡지 못한다. 기본값
  // (즉시 이동)이 그 환경에서 안전하다. 온보딩은 _shell 밖이라(router.tsx) 고정 상단바에
  // 가려질 걱정도 없다.
  useEffect(() => {
    if (!isBudgetOpen) return;
    cardRef.current?.scrollIntoView({ block: "start" });
  }, [isBudgetOpen]);

  function updateRow(categoryCode: string, plannedBudget: number) {
    onRowsChange(rows.map((row) => (row.categoryCode === categoryCode ? { ...row, plannedBudget } : row)));
  }

  return (
    <div className="flex flex-col gap-4">
      <div ref={cardRef} className="rounded-md border border-line bg-surface p-4">
        {/* 🚨 [2026-08-29, 320px 전수 검사] `flex-wrap gap-x-2` 를 더했다 — 종전엔 둘 다 없어서
            좁은 폭에서 **왼쪽 문구가 두 줄로 접혔다.**
              320px 기기 → 온보딩 열 288 → 이 상자(`p-4` + 보더) 안쪽 **254px**
              왼쪽 「50,000,000원 배분됨」(`text-base` 16px) ≈ 165px
              오른쪽 「/ 40,000,000원 ⌄」(`text-xs` 12px)  ≈ 112px   → 합 277px
            실제 예산이 5천만~1.5억이라 자릿수가 늘 8~9자리다 — 즉 **거의 항상** 넘쳤다.
            `keep-all`(D19) 덕에 「배/분/됨」으로 붕괴하진 않았지만, 대신 「50,000,000원」과
            「배분됨」이 어절 단위로 갈라져 두 줄이 됐다.
            `flex-wrap` 은 그 압력을 **오른쪽 버튼**이 받게 한다 — flex 는 아이템의 가정 크기 합이
            줄을 넘으면 아이템 단위로 줄을 나누므로, 버튼이 다음 줄로 내려가고 왼쪽 문구는 한 줄에
            남는다. `gap-x-2` 는 한 줄에 들어갈 때 둘이 맞닿지 않게 하는 몫(종전엔 gap 이 아예 없었다). */}
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2">
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

        <DisclosurePanel id={BUDGET_PANEL_ID} open={isBudgetOpen}>
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
        </DisclosurePanel>
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

        {/* **목록 <div> 안에 두는 이유** — 바깥 `flex flex-col gap-4` 의 형제로 두면 숨은
            동안에도 gap 16px 이 그대로 남아 목록 아래에 빈 줄이 생긴다(StatusCallout 의 <output>
            은 숨어도 여전히 flex 아이템이다). 여백은 그 컴포넌트 자신의 mt-4 가 낸다. */}
        <StatusCallout shown={isOverAllocated}>
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
        </StatusCallout>
      </div>
    </div>
  );
}
