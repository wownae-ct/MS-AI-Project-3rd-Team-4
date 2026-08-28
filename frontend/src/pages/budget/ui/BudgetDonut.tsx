// 예산 도넛 + 범례 (시각 스펙: docs/mockups/s2-dashboard.html:158-182).
//
// **왜 라이브러리를 쓰지 않는가** — 다계열 단일 도넛은 `conic-gradient` 한 줄이면 된다.
// 차트 라이브러리는 초기 청크 여유(3 kB 대)를 통째로 먹는다(inventory.md 도 「자작」으로 적었다).
//
// **왜 클래스가 아니라 인라인 스타일인가** — 비율이 데이터에서 나오므로 `w-[25%]` 같은 조립
// 클래스로는 쓸 수 없다. Tailwind 스캐너는 소스를 평문으로 읽어 런타임 조립을 찾지 못하고,
// **빌드는 성공한 채 스타일만 사라진다**(CLAUDE.md §5.1). 인라인 스타일은 스캐너와 무관하다.
// 색은 hex 가 아니라 `var(--color-*)` 로 참조한다 — 규범 게이트가 보는 팔레트 안에 머무른다.
//
// **접근성** — 도넛은 색으로만 계열을 구분한다. 그래서 범례가 **라벨과 금액을 텍스트로** 함께
// 낸다(WCAG 1.4.1). 이 대비책이 사라지지 않도록 `BudgetDonut.test.tsx` 가 고정한다.
// 범례 점의 테두리는 `ink-soft` 다 — `미배정` 의 채움색이 `line`(1.28:1)이라 테두리가 없으면
// 흰 표면에서 점 자체가 보이지 않는다(a11y.md §3 「경계가 유일한 식별 수단」).
//
// **4계열로 확장(2026-08-28, red-bug.md #7 근본 수정) — 지불완료/지불예정/배정/미배정.**
// 예전 "계획(미지급)"이 "배정만 해둔 금액"과 "결제 항목까지 만든 지불예정 금액"을 한 계열에
// 뭉쳐 놨던 것 자체가 S5(리포트)와 여기(S6)가 "미배정"을 다른 정의로 계산하던 버그의 근본
// 원인이었다(`entities/wedding/model/derive-budget-summary.ts` 머리말). "지불예정" 색은 결제
// 유형 배지 전용이던 `--color-payment-interim`을 재사용한다 — 새 토큰을 만들지 않는다(이미
// D8 절차를 거쳐 WCAG AA를 넘긴 기존 토큰의 재사용이지, 새 색을 지어내는 것이 아니다.
// surface 6.66 · bg 6.16 · line 5.21, theme.css 참고 — 전부 4.5:1 이상).
//
// **총예산 인라인 수정을 이 컴포넌트가 직접 담당한다(UX 개편 2차, 2026-08-26, 사용자 지시).**
// 원래 별도 "남은예산" 카드(`TotalBudgetCard.tsx`, 삭제됨)가 하던 일이다 — "총 예산 현황" 카드
// 안에 도넛·범례·총예산 수정이 이미 다 모여 있는데 남은예산만 별개 카드로 떼어 둘 이유가
// 없다는 사용자 판단. **다만 "미배정" 범례 줄 자체는 여전히 0으로 클램프한다**(레드팀 감사로
// 고친 음수 오독 버그, 아래 `Math.max(0, ...)` 참고) — 총예산보다 배정 합계가 많은 경우는
// 그 대신 아래 별도 문구로 알린다(카테고리별 예산 현황의 "OO만원 초과 지불"과 같은 D6 텍스트
// 전용 관례, 성격은 다르다 — 이건 "총예산 대비 배정 초과", 그건 "카테고리별 지급 대비 배정 초과").
//
// **"예산 시세 비교"를 대시보드에서 이 카드로 흡수한다(UX 개편 3차, 2026-08-26, 사용자 지시).**
// 예전엔 대시보드에 `BudgetBenchmarkCard.tsx`(삭제됨)가 별도 카드로 떠 있었다 — 예산 상세는
// 이미 예산 페이지가 전담한다는 2차 개편의 연장선에서, 총예산 대비 지역 시세는 "총 예산 현황"
// 카드 하단(예전 "총예산 …원 중 수정" 자리)으로 옮겼다. 그 자리를 비우려고 수정 버튼을
// 카드 제목 옆으로 올렸다 — 도넛 구멍 안(104px)은 이미 한 번 넘쳐서 키운 자리라 더 넣지
// 않는다(아래 도넛 마크업 주석 참고). Card.tsx의 `titleAction` 슬롯이 이 개편으로 새로 생겼다.
//
// **UX 개편 4차(2026-08-27, 사용자 지시) — 카드 제목 "예산 현황" → "총 예산 현황".**
// "카테고리별 예산 현황"(AllocationOverview.tsx의 다른 카드)과 짝이 되도록 맞췄다 — 하나는
// 전체 합계, 하나는 카테고리별 상세라는 관계가 제목만 보고도 드러난다. 같은 날 "집행"이라는
// 말도 전부 "지불"로 바꿨다(아래 SERIES "지불 완료"/"지불 예정" 등).
import { useState } from "react";
import type { BudgetBenchmarkSummary } from "@/entities/dashboard";
import { updateMyWedding, type BudgetSummary } from "@/entities/wedding";
import { ApiError } from "@/shared/api";
import { AMOUNT_STEP_MANWON, manwonToWon, wonToManwon } from "@/shared/lib/money";
import { safeExternalUrl } from "@/shared/lib/safe-url";
import { Badge, Card, Money, NumberInput } from "@/shared/ui";

const INLINE_INPUT =
  "min-h-tap w-28 rounded-md border border-line bg-surface px-2.5 text-right text-base text-ink " +
  "[font-variant-numeric:tabular-nums] focus-visible:border-primary";
const GHOST_BUTTON = "text-xs font-bold text-ink-soft transition-colors duration-150 hover:text-primary";

interface Series {
  label: string;
  /** 팔레트 토큰 참조. hex 를 직접 쓰지 않는다(D8). */
  color: string;
  amount: (summary: BudgetSummary) => number;
}

const SERIES: readonly Series[] = [
  { label: "지불 완료", color: "var(--color-primary)", amount: (s) => s.paid },
  { label: "지불 예정", color: "var(--color-payment-interim)", amount: (s) => s.scheduled },
  { label: "배정", color: "var(--color-ink-soft)", amount: (s) => s.allocated },
  // 「잔여」가 아니라 「미배정」이다 — 45,000,000 − 3,800,000 ≠ 1,000,000 이라 「잔여」로 적으면
  // 숫자가 맞지 않아 보인다. 여기 도넛은 네 계열이 총액을 채우므로 문맥이 뜻을 잡아 주지만,
  // 리포트(S5)도 이제 같은 `deriveBudgetSummary`를 쓰므로 같은 이름을 유지한다.
  // 초과지출(paid+scheduled+allocated > total)이면 backend 는 음수를 그대로 돌려준다(캡을 안
  // 두기로 한 결정, done.md 2026-08-26) — 여기서 0 으로 클램프한다. 음수 그대로 내면
  // "미배정 -1,000,000원"처럼 읽혀 총액이 잘못 나온 것처럼 보인다(레드팀 감사 파생 발견, todo.md).
  { label: "미배정", color: "var(--color-line)", amount: (s) => Math.max(0, s.unallocated) },
];

export interface BudgetDonutProps {
  summary: BudgetSummary;
  onTotalBudgetSaved: (nextTotal: number) => void;
  /** 대시보드에서 옮겨온 총예산 vs 지역 시세 — 해당 지역에 참가격 데이터가 없으면 null(하단
      비교 문구 자체를 그리지 않는다, 예전 BudgetBenchmarkCard.tsx와 같은 규칙). */
  benchmark: BudgetBenchmarkSummary | null;
}

export function BudgetDonut({ summary, onTotalBudgetSaved, benchmark }: BudgetDonutProps) {
  const { total, paid, scheduled, allocated } = summary;

  // 예전엔 `draft: string | null` 하나가 "편집 중인가"와 "입력값" 두 가지를 겸했다. 입력칸이
  // `NumberInput` 으로 바뀌면서 값 쪽에도 null(빈 칸)이 필요해져 두 의미가 충돌한다 —
  // 그래서 상태를 둘로 쪼갠다. "수정을 열었다"와 "칸을 비웠다"는 원래 다른 사실이다.
  const [isEditing, setIsEditing] = useState(false);
  const [draftManwon, setDraftManwon] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function startEdit() {
    setDraftManwon(wonToManwon(total));
    setIsEditing(true);
    setSaveState("idle");
    setErrorMessage(null);
  }

  function cancelEdit() {
    setIsEditing(false);
    setDraftManwon(null);
    setSaveState("idle");
    setErrorMessage(null);
  }

  async function handleSaveTotal() {
    // 빈 칸으로 저장을 누르면 0원이 아니라 아무 일도 하지 않는다 — 예전 `Number("")` 는 0이라
    // 총예산이 조용히 0이 될 수 있었다(입력이 문자열이던 시절의 사각지대).
    if (draftManwon === null) {
      setSaveState("error");
      setErrorMessage("총예산을 입력해 주세요.");
      return;
    }
    const nextTotal = manwonToWon(draftManwon);
    setSaveState("saving");
    setErrorMessage(null);
    try {
      await updateMyWedding({ total_budget: nextTotal });
      onTotalBudgetSaved(nextTotal);
      setIsEditing(false);
      setDraftManwon(null);
      setSaveState("idle");
    } catch (err) {
      setSaveState("error");
      setErrorMessage(err instanceof ApiError ? err.message : "총예산을 저장하지 못했어요. 다시 시도해 주세요.");
    }
  }

  // total 이 0 이면 나눗셈이 NaN 이 되고 conic-gradient 가 통째로 무효가 된다(조용히 배경이 사라진다).
  const safeTotal = total > 0 ? total : 1;
  // 초과지출(paid+scheduled+allocated > total)이면 100% 를 넘는 stop 이 나온다 — conic-gradient
  // 는 이걸 그대로 클램프하긴 하지만 마지막 계열("미배정") 구간이 통째로 사라지는 대신 그 앞
  // 색이 아예 안 그려지는 결과가 되어 링이 "잘려나간" 것처럼 보인다(레드팀 감사 파생 발견). 100
  // 으로 명시적으로 클램프해 최소한 앞 세 계열은 항상 정확한 비율로 채워지게 한다.
  const paidEnd = Math.min((paid / safeTotal) * 100, 100);
  const scheduledEnd = Math.min(((paid + scheduled) / safeTotal) * 100, 100);
  const allocatedEnd = Math.min(((paid + scheduled + allocated) / safeTotal) * 100, 100);

  // ⚠️ 변수 이름에 **Tailwind 유틸리티와 같은 단어**를 쓰지 말 것. 스캐너는 소스를 평문으로 읽어
  // 식별자든 주석이든 가리지 않고 후보로 삼는다 — D9 가 금지한 「테두리 강조」 유틸리티와 같은
  // 이름을 붙였다가 그 커스텀 속성이 산출 CSS 에 실렸고, 빌드 규범 게이트와 T3 유령 후보 테스트가
  // **동시에** 잡았다. 고치면서 경고 주석에 그 단어를 그대로 적었다가 **한 번 더** 잡혔다.
  // CLAUDE.md §5.9 「산문이 유틸리티를 만든다」의 실제 사례다 — 이 주석이 그 증거다.
  const donutGradient =
    `conic-gradient(` +
    `var(--color-primary) 0 ${paidEnd}%,` +
    `var(--color-payment-interim) ${paidEnd}% ${scheduledEnd}%,` +
    `var(--color-ink-soft) ${scheduledEnd}% ${allocatedEnd}%,` +
    `var(--color-line) ${allocatedEnd}% 100%)`;

  // 카드 제목 옆(titleAction)에 놓는 수정 트리거/폼 — 예전엔 아래 "총예산 …원 중" 행이 이 역할을
  // 함께 했지만, 그 행 자체가 시세 비교 문구로 바뀌면서 트리거만 제목 옆으로 옮겼다.
  const editTrigger = isEditing ? (
      <span className="flex flex-wrap items-center gap-1.5">
        <NumberInput
          step={AMOUNT_STEP_MANWON}
          min={0}
          value={draftManwon}
          onValueChange={setDraftManwon}
          className={INLINE_INPUT}
          aria-label="총예산(만원)"
        />
        <span className="text-xs text-ink-soft">만원</span>
        <button
          type="button"
          onClick={() => void handleSaveTotal()}
          disabled={saveState === "saving"}
          className={GHOST_BUTTON}
        >
          {saveState === "saving" ? "저장 중…" : "저장"}
        </button>
        {/* 저장 진행 중엔 취소를 막는다 — 안 막으면 취소 후에도 진행 중이던 저장이 성공 시
            되살아난다(레드팀 감사 HIGH, 예전 TotalBudgetCard.tsx와 같은 이유). */}
        <button type="button" onClick={cancelEdit} disabled={saveState === "saving"} className={GHOST_BUTTON}>
          취소
        </button>
      </span>
  ) : (
    <button type="button" onClick={startEdit} className={GHOST_BUTTON}>
      수정
    </button>
  );

  // source_url이 있어도 스킴 검증 없이 href에 그대로 꽂지 않는다(예전 BudgetBenchmarkCard.tsx와
  // 같은 원칙) — 값 자체는 백엔드에서 온 문자열이다.
  const safeBenchmarkUrl = benchmark === null ? null : safeExternalUrl(benchmark.source_url);

  return (
    <Card title="총 예산 현황" titleAction={editTrigger}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-5">
          {/* 도넛 테두리 자체는 장식이다 — 같은 정보를 옆 범례가 텍스트로 낸다. 가운데 라벨만 의미를 갖는다.
              ⚠️ 지름이 목업(112px)보다 크다. 목업의 캡션은 `.6rem`(9.6px)인데 **우리 타입 스케일의 하한은
              `text-xs`(12px)** 다 — 스케일을 지키면 같은 구멍(80px)에는 들어가지 않는다. 실제로 112px 로
              만들었다가 브라우저에서 글자가 원 밖으로 넘쳤다(구멍 80px, 내용 84px).
              임의 폰트 크기를 만드는 대신 **원을 키웠다**: 128px · 링 12px → 구멍 104px.
              가로 패딩도 뺐다 — `px-2` 가 가용폭을 64px 로 깎아 넘침을 키우고 있었다. */}
          <div className="relative size-32 shrink-0 rounded-pill" style={{ background: donutGradient }}>
            <div className="absolute inset-3 flex flex-col items-center justify-center gap-px rounded-pill bg-surface text-center">
              <Money value={paid} className="text-sm leading-tight" />
              <span className="text-xs leading-tight whitespace-nowrap text-ink-soft">
                총 <Money value={total} className="text-xs" />
              </span>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {SERIES.map((series) => (
              <div key={series.label} className="flex items-center gap-2 text-sm">
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-pill border border-ink-soft"
                  style={{ background: series.color }}
                />
                <span className="min-w-0 flex-1 text-ink-soft">{series.label}</span>
                <Money value={series.amount(summary)} className="text-sm whitespace-nowrap" />
              </div>
            ))}
          </div>
        </div>

        {saveState === "error" && (
          <p role="alert" className="text-xs text-primary">
            {errorMessage}
          </p>
        )}
        {/* "미배정" 범례는 위에서 0으로 클램프돼 있다 — 총예산보다 배정 합계가 더 많은 경우를
            여기서 별도로 알린다(음수 "미배정"을 그대로 보여주면 오독된다는 기존 결정은 그대로 둔다). */}
        {summary.unallocated < 0 && (
          <p className="text-xs font-bold text-primary">
            배정 합계가 총예산보다 {wonToManwon(Math.abs(summary.unallocated)).toLocaleString("ko-KR")}만원 더 많아요
          </p>
        )}
        {/* 예전 "총예산 …원 중 수정" 행이 있던 자리 — 수정 트리거는 카드 제목 옆으로 옮겼고,
            이 자리는 대시보드에서 흡수한 시세 비교 문구가 대신한다. benchmark가 null(해당
            지역에 참가격 데이터 없음)이면 이 블록 자체를 그리지 않는다(예전 BudgetBenchmarkCard.tsx와
            같은 규칙 — "데이터 없음" 문구 대신 아예 숨긴다). */}
        {benchmark !== null && (
          <div className="flex flex-col gap-1 border-t border-line pt-3">
            <p className="flex flex-wrap items-center gap-1.5 text-sm text-ink-soft">
              총예산이 지역 시세 대비 {benchmark.percentile_label} · 중앙값{" "}
              <Money value={benchmark.median_price} className="text-sm" />
              <Badge>{benchmark.ratio_to_median.toFixed(2)}배</Badge>
            </p>
            {safeBenchmarkUrl && (
              <a
                href={safeBenchmarkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-fit text-xs text-primary underline"
              >
                출처 보기
              </a>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
