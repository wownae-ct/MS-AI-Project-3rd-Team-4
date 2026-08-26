// 예산 도넛 + 범례 (시각 스펙: docs/mockups/s2-dashboard.html:158-182).
//
// **왜 라이브러리를 쓰지 않는가** — 3계열 단일 도넛은 `conic-gradient` 한 줄이면 된다.
// 차트 라이브러리는 초기 청크 여유(3 kB 대)를 통째로 먹는다(inventory.md 도 「자작」으로 적었다).
//
// **왜 클래스가 아니라 인라인 스타일인가** — 비율이 데이터에서 나오므로 `w-[25%]` 같은 조립
// 클래스로는 쓸 수 없다. Tailwind 스캐너는 소스를 평문으로 읽어 런타임 조립을 찾지 못하고,
// **빌드는 성공한 채 스타일만 사라진다**(CLAUDE.md §5.1). 인라인 스타일은 스캐너와 무관하다.
// 색은 hex 가 아니라 `var(--color-*)` 로 참조한다 — 규범 게이트가 보는 팔레트 안에 머무른다.
//
// **접근성** — 도넛은 색으로만 3계열을 구분한다. 그래서 범례가 **라벨과 금액을 텍스트로** 함께
// 낸다(WCAG 1.4.1). 이 대비책이 사라지지 않도록 `DashboardPage.test.tsx` 가 고정한다.
// 범례 점의 테두리는 `ink-soft` 다 — `잔여` 의 채움색이 `line`(1.28:1)이라 테두리가 없으면
// 흰 표면에서 점 자체가 보이지 않는다(a11y.md §3 「경계가 유일한 식별 수단」).
//
// **총예산 인라인 수정을 이 컴포넌트가 직접 담당한다(UX 개편 2차, 2026-08-26, 사용자 지시).**
// 원래 별도 "남은예산" 카드(`TotalBudgetCard.tsx`, 삭제됨)가 하던 일이다 — "예산 현황" 카드
// 안에 도넛·범례·총예산 수정이 이미 다 모여 있는데 남은예산만 별개 카드로 떼어 둘 이유가
// 없다는 사용자 판단. **다만 "미배정" 범례 줄 자체는 여전히 0으로 클램프한다**(레드팀 감사로
// 고친 음수 오독 버그, 아래 `Math.max(0, ...)` 참고) — 총예산보다 배정 합계가 많은 경우는
// 그 대신 아래 별도 문구로 알린다(카테고리별 배정의 "OO만원 초과 집행"과 같은 D6 텍스트 전용
// 관례, 성격은 다르다 — 이건 "총예산 대비 배정 초과", 그건 "카테고리별 지급 대비 배정 초과").
import { useState } from "react";
import { updateMyWedding, type BudgetSummary } from "@/entities/wedding";
import { ApiError } from "@/shared/api";
import { manwonToWon, wonToManwon } from "@/shared/lib/money";
import { Money } from "@/shared/ui";

const INLINE_INPUT =
  "w-28 rounded-md border border-line bg-surface px-2.5 py-1.5 text-right text-sm text-ink " +
  "[font-variant-numeric:tabular-nums] focus-visible:border-primary";
const GHOST_BUTTON = "text-xs font-bold text-ink-soft transition-colors duration-150 hover:text-primary";

interface Series {
  label: string;
  /** 팔레트 토큰 참조. hex 를 직접 쓰지 않는다(D8). */
  color: string;
  amount: (summary: BudgetSummary) => number;
}

const SERIES: readonly Series[] = [
  { label: "집행", color: "var(--color-primary)", amount: (s) => s.paid },
  { label: "계획(미지급)", color: "var(--color-ink-soft)", amount: (s) => s.planned },
  // 「잔여」가 아니라 「미배정」이다 — 45,000,000 − 3,800,000 ≠ 1,000,000 이라 「잔여」로 적으면
  // 숫자가 맞지 않아 보인다. 여기 도넛은 세 계열이 총액을 채우므로 문맥이 뜻을 잡아 주지만,
  // 리포트(S5)는 계획 항목 없이 세 값만 나열해 혼자 서면 오독된다. 같은 필드에 두 이름을 두지 않는다.
  // 초과지출(paid+planned > total)이면 backend 는 음수를 그대로 돌려준다(캡을 안 두기로 한 결정,
  // done.md 2026-08-26) — 여기서 0 으로 클램프한다. 음수 그대로 내면 "미배정 -1,000,000원"처럼
  // 읽혀 총액이 잘못 나온 것처럼 보인다(레드팀 감사 파생 발견, todo.md).
  { label: "미배정", color: "var(--color-line)", amount: (s) => Math.max(0, s.remaining) },
];

export interface BudgetDonutProps {
  summary: BudgetSummary;
  onTotalBudgetSaved: (nextTotal: number) => void;
}

export function BudgetDonut({ summary, onTotalBudgetSaved }: BudgetDonutProps) {
  const { total, paid, planned } = summary;

  const [draft, setDraft] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function startEdit() {
    setDraft(String(wonToManwon(total)));
    setSaveState("idle");
    setErrorMessage(null);
  }

  function cancelEdit() {
    setDraft(null);
    setSaveState("idle");
    setErrorMessage(null);
  }

  async function handleSaveTotal() {
    if (draft === null) return;
    const nextTotal = manwonToWon(Number(draft));
    setSaveState("saving");
    setErrorMessage(null);
    try {
      await updateMyWedding({ total_budget: nextTotal });
      onTotalBudgetSaved(nextTotal);
      setDraft(null);
      setSaveState("idle");
    } catch (err) {
      setSaveState("error");
      setErrorMessage(err instanceof ApiError ? err.message : "총예산을 저장하지 못했어요. 다시 시도해 주세요.");
    }
  }

  // total 이 0 이면 나눗셈이 NaN 이 되고 conic-gradient 가 통째로 무효가 된다(조용히 배경이 사라진다).
  const safeTotal = total > 0 ? total : 1;
  // 초과지출(paid+planned > total)이면 100% 를 넘는 stop 이 나온다 — conic-gradient 는 이걸
  // 그대로 클램프하긴 하지만 마지막 계열("미배정") 구간이 통째로 사라지는 대신 세 번째 색이
  // 아예 안 그려지는 결과가 되어 링이 "잘려나간" 것처럼 보인다(레드팀 감사 파생 발견). 100 으로
  // 명시적으로 클램프해 최소한 paid/planned 두 계열은 항상 정확한 비율로 채워지게 한다.
  const paidEnd = Math.min((paid / safeTotal) * 100, 100);
  const plannedEnd = Math.min(((paid + planned) / safeTotal) * 100, 100);

  // ⚠️ 변수 이름에 **Tailwind 유틸리티와 같은 단어**를 쓰지 말 것. 스캐너는 소스를 평문으로 읽어
  // 식별자든 주석이든 가리지 않고 후보로 삼는다 — D9 가 금지한 「테두리 강조」 유틸리티와 같은
  // 이름을 붙였다가 그 커스텀 속성이 산출 CSS 에 실렸고, 빌드 규범 게이트와 T3 유령 후보 테스트가
  // **동시에** 잡았다. 고치면서 경고 주석에 그 단어를 그대로 적었다가 **한 번 더** 잡혔다.
  // CLAUDE.md §5.9 「산문이 유틸리티를 만든다」의 실제 사례다 — 이 주석이 그 증거다.
  const donutGradient =
    `conic-gradient(` +
    `var(--color-primary) 0 ${paidEnd}%,` +
    `var(--color-ink-soft) ${paidEnd}% ${plannedEnd}%,` +
    `var(--color-line) ${plannedEnd}% 100%)`;

  return (
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

      <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
        {draft === null ? (
          <span className="flex items-center gap-2 text-xs text-ink-soft">
            총예산 {total.toLocaleString("ko-KR")}원 중
            <button type="button" onClick={startEdit} className={GHOST_BUTTON}>
              수정
            </button>
          </span>
        ) : (
          <span className="flex flex-wrap items-center gap-1.5">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
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
        )}
      </div>
      {saveState === "error" && (
        <p role="alert" className="text-xs text-primary">
          {errorMessage}
        </p>
      )}
      {/* "미배정" 범례는 위에서 0으로 클램프돼 있다 — 총예산보다 배정 합계가 더 많은 경우를
          여기서 별도로 알린다(음수 "미배정"을 그대로 보여주면 오독된다는 기존 결정은 그대로 둔다). */}
      {summary.remaining < 0 && (
        <p className="text-xs font-bold text-primary">
          배정 합계가 총예산보다 {wonToManwon(Math.abs(summary.remaining)).toLocaleString("ko-KR")}만원 더 많아요
        </p>
      )}
    </div>
  );
}
