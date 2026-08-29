// BudgetPage.tsx에서 분리 — eslint/max-lines(300줄) 게이트 때문에 카테고리 한 행의 세 가지
// 렌더 분기(비용 없음/보기 모드/시나리오 편집 모드 슬라이더)를 별도 파일로 뺐다. 상태(scenarioDraft
// 등)는 여전히 BudgetPage가 소유한다 — 이 컴포넌트는 순수하게 한 행만 그린다.
import { Slider } from "@base-ui/react/slider";
import type { BenchmarkComparison } from "@/entities/payment";
import type { WeddingCategory } from "@/entities/wedding";
import { AMOUNT_STEP_MANWON, formatManwon, manwonToWon, wonToManwon, wonToManwonCeil } from "@/shared/lib/money";
import { Badge, Money, Progress } from "@/shared/ui";

export interface CategoryAllocationRowProps {
  category: WeddingCategory;
  hasCost: boolean;
  totalBudget: number;
  /** 시세비교 대상인지 — 대시보드 `CategoryRow.tsx`와 같은 의미(2026-08-26, UX 개편 2차,
      사용자 지시). 편집(슬라이더) 중에는 저장된 원본 기준으로만 보여준다 — 드래그마다 다시
      조회하지 않는다(BudgetPage.tsx가 draft가 아니라 원본 categories로 훅을 호출한다). */
  hasBenchmark: boolean;
  benchmark: BenchmarkComparison | undefined;
  /** 편집 중이 아니면(보기 모드) 슬라이더 대신 읽기전용 진행률 바를 그린다. */
  isEditingScenario: boolean;
  /** 저장된 원본 금액 — 초안(draft)과 비교해 취소선/델타를 그리는 기준. */
  originalAmount: number;
  onDraftChange: (categoryCode: string, plannedBudget: number) => void;
}

const ROW = "flex flex-col gap-1.5 border-b border-line py-3 last:border-b-0 last:pb-0 first:pt-0";
// 10만원 단위(2026-08-26 사용자 지시) — 단위가 "만원"이라 여기선 10. 온보딩 Step8Allocation의
// 같은 지시(BUDGET_STEP_WON = 100_000원)와 값 자체는 동일하다, 단위만 다르다.
// 2026-08-28: 손으로 적어 둔 10을 shared 상수로 바꿨다 — 같은 값이 세 파일에 흩어져 있으면
// 하나만 바뀌었을 때 슬라이더와 숫자 입력의 스텝이 조용히 갈린다.
const SLIDER_STEP_MANWON = AMOUNT_STEP_MANWON;

export function CategoryAllocationRow({
  category,
  hasCost,
  totalBudget,
  hasBenchmark,
  benchmark,
  isEditingScenario,
  originalAmount,
  onDraftChange,
}: CategoryAllocationRowProps) {
  // 비활성 카테고리는 여기까지 오지 않는다 — 호출부(CategoryAllocationList)가 목록에서 미리
  // 거른다(2026-08-29, 사용자 결정). 이 컴포넌트는 활성 카테고리 한 행만 그리면 된다.
  if (!hasCost) {
    return (
      <div className={ROW}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-bold text-ink">{category.name_ko}</span>
          <span className="text-xs text-ink-soft">비용 없음</span>
        </div>
      </div>
    );
  }

  if (!isEditingScenario) {
    // Progress는 값을 [0,1]로 클램프한다 — 초과지출(paid_amount>planned_budget, 비율>100%)이
    // "정확히 다 씀"과 시각적으로 구분되지 않는다(레드팀 감사). 편집 모드를 열어야만 초과 여부를
    // 알 수 있던 문제를, 보기 모드에도 D6(상태색 없이 텍스트만) 관례대로 문구를 더해 해소한다.
    const overspend = category.paid_amount - category.planned_budget;
    // 예산을 아예 배정하지 않은(planned_budget=0) 카테고리에 지출이 생긴 경우 — 원래는 막대가
    // 강제로 0%, 상단 금액도 0만원으로 보여 "아무 일도 안 일어난 것"처럼 보이는 버그였다
    // (사용자 신고, 2026-08-27). planned_budget=0이면 나눗셈(paid/planned)이 정의되지 않으므로
    // 이 경우만 막대를 꽉 채운다("배정 전체가 초과"라는 뜻) — 정상 범위/일반 초과지출(둘 다
    // planned_budget>0)은 기존 비율 계산 그대로다. 상단 금액도 이 경우엔 배정액(0) 대신
    // 실제 지출액을 보여준다 — 사용자가 A/B 두 안을 검토한 뒤 B안(실지출액 숫자)을 골랐다.
    const isUnallocatedOverspend = category.planned_budget <= 0 && category.paid_amount > 0;
    const progressValue = category.planned_budget > 0
      ? category.paid_amount / category.planned_budget
      : isUnallocatedOverspend
        ? 1
        : 0;
    const headlineAmount = isUnallocatedOverspend ? category.paid_amount : category.planned_budget;
    return (
      <div className={ROW}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-bold text-ink">{category.name_ko}</span>
          <span className="text-sm font-bold text-ink [font-variant-numeric:tabular-nums]">
            {formatManwon(headlineAmount)}만원
          </span>
        </div>
        <Progress value={progressValue} label={`${category.name_ko} 예산 지불률`} />
        {overspend > 0 && (
          <span className="text-xs font-bold text-primary">
            {formatManwon(overspend)}만원 초과 지불
            {/* 미배정 카테고리는 위 헤드라인 금액이 이미 실지출액이라(B안) "초과분"과 값이
                같다 — 왜 그런지(배정 자체가 없어서) 회색 보조 표기로 밝혀 헷갈리지 않게 한다
                (사용자 지시, 2026-08-27). */}
            {isUnallocatedOverspend && <span className="font-normal text-ink-soft"> - 예산 미배정</span>}
          </span>
        )}
        {hasBenchmark &&
          (benchmark ? (
            // flex-wrap — 배지가 이제 안 눌리므로(D16) 좁은 폭에서는 배지가 다음 줄로 내려가야
            // 한다. BudgetDonut 의 같은 줄은 이미 켜져 있었다(CategoryRow 와 같은 보정).
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
              시세 대비 {benchmark.percentile_label} · 중앙값 <Money value={benchmark.median_price} className="text-xs" />
              <Badge>{benchmark.ratio_to_median.toFixed(2)}배</Badge>
            </p>
          ) : (
            <p className="text-xs text-ink-soft">예산을 배정하면 시세와 비교할 수 있어요.</p>
          ))}
      </div>
    );
  }

  const delta = category.planned_budget - originalAmount;
  const changed = delta !== 0;
  // 트랙 전체(0~max)를 기준으로 한 잠김 구간 폭 — maxManwon 은 항상 현재 배분액 이상이어야
  // 슬라이더가 값을 못 담는 사고가 안 난다(총예산보다 이미 더 배정된 극단적 케이스 방어).
  const maxManwon = Math.max(wonToManwon(totalBudget), wonToManwon(category.planned_budget), 1);
  const lockedPercent = totalBudget > 0 ? (category.paid_amount / manwonToWon(maxManwon)) * 100 : 0;

  return (
    <div className={ROW}>
      {/* 🚨 [2026-08-29, 320px 전수 검사] `flex-wrap` — 이 행은 편집 중에만 금액을 **두 개**
          (취소선 원본 + 새 값) 싣는데, 둘 다 `flex-none` 안에 있어 눌리지 않고 카테고리명도
          `keep-all`(D19) 때문에 어절 아래로 못 줄어든다. 즉 양쪽 다 안 줄어드는 행이다.
            320px 기기 → 카드 안쪽 254px
            이름 「청첩장·답례품」(가운뎃점은 UAX #14 상 낱말 안의 문자라 7자가 한 덩어리) ≈ 98px
            금액 「30,000만원 30,000만원」(`text-sm`) ≈ 160px  → gap 8 을 더해 **266px**
          보기 모드(금액 하나)는 184px 이라 안전하지만 편집 모드에서만 12px 넘쳤다 — 3억대
          신혼집처럼 만원 표기가 6자리가 되는 카테고리에서 실제로 걸린다.
          `flex-wrap` 이면 금액 덩어리가 다음 줄로 내려가고 이름은 한 줄에 남는다. 나머지 세
          분기(비용 없음 · 보기 모드 · 하단 잠김 표시)는 값이 하나뿐이라 그대로 둔다 — 재보고
          안전해서 두는 것이지 빠뜨린 것이 아니다. */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-ink">{category.name_ko}</span>
        <span className="flex-none text-sm font-bold text-ink [font-variant-numeric:tabular-nums]">
          {changed && <span className="mr-1 font-normal text-ink-soft line-through">{formatManwon(originalAmount)}만원</span>}
          {formatManwon(category.planned_budget)}만원
        </span>
      </div>

      <Slider.Root
        value={wonToManwon(category.planned_budget)}
        min={0}
        max={maxManwon}
        step={SLIDER_STEP_MANWON}
        disabled={!category.is_active}
        aria-label={`${category.name_ko} 예산 조절`}
        onValueChange={(manwonValue) => {
          // 이미 지급한 금액 아래로는 못 내린다 — paid_amount 가 슬라이더 하한이다. STEP 12 —
          // paid_amount 는 만원 단위가 아닐 수 있는 실결제액이라(예: 1,234,567원), 그대로 하한에
          // 쓰면 화면엔 만원 단위로만 보이는데 저장값은 그 결제액 그대로가 될 수 있었다. 만원
          // 단위로 올림(ceil)해 화면 표시-저장값 단위를 맞춘다.
          const paidAmountFloor = manwonToWon(wonToManwonCeil(category.paid_amount));
          const next = Math.max(paidAmountFloor, manwonToWon(manwonValue));
          onDraftChange(category.category_code, next);
        }}
      >
        <Slider.Control className="relative flex h-4 w-full items-center">
          <Slider.Track className="relative h-2 w-full rounded-pill bg-line">
            {/* overflow-hidden은 이 안쪽 래퍼에만 건다 — Track 자체에 걸면 15px Thumb(트랙 높이
                8px보다 큼)이 위아래로 잘린다. */}
            <div className="absolute inset-0 overflow-hidden rounded-pill">
              <Slider.Indicator className="h-full bg-primary" />
              {/* 잠김 구간 — Base UI가 모르는 개념이라 별도 오버레이로 그린다. */}
              {lockedPercent > 0 && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-0 left-0 h-full bg-ink-soft"
                  style={{ width: `${lockedPercent.toString()}%` }}
                />
              )}
            </div>
            {/* 목업의 thumb 바깥 primary 링(box-shadow)은 넣지 않는다 — 이 저장소는 그림자·링을
                금지한다(D9/D10, shared/ui/README.md). */}
            <Slider.Thumb className="h-[15px] w-[15px] rounded-pill border-[2.5px] border-surface bg-primary" />
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>

      <div className="flex items-baseline justify-between gap-2 text-xs text-ink-soft">
        <span>지급 {formatManwon(category.paid_amount)}만원 잠김</span>
        {changed && (
          <span aria-live="polite" className="font-bold text-primary">
            {delta > 0 ? "+" : ""}
            {formatManwon(delta)}만원
          </span>
        )}
      </div>
    </div>
  );
}
