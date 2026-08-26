// "결혼식 날짜" 인라인 수정 버튼 — 원래 BudgetPage.tsx의 독립 Card였으나(oxlint max-lines 300줄
// 상한 초과로 추출) 사용자 지시(2026-08-26, UX 개편 2차)로 대시보드 헤드라인 옆으로 옮겼다 —
// 예산탭에는 더 이상 이 컴포넌트가 없다. 대시보드는 이미 헤드라인에 날짜 텍스트를 자체적으로
// 그리므로(`DashboardPage.tsx`) 이 컴포넌트는 Card로 감싸지 않고 "수정" 버튼 + 인라인 폼만
// 담당한다 — 날짜 텍스트 자체는 호출부가 그린다.
//
// 03_API_spec.md #8(PATCH /weddings/me)의 "사용 화면: S1(수정 시), S6"이 날짜 수정처를
// 명시한다 — S6(예산)에서 S2(대시보드)로 위치만 옮겼을 뿐 근거는 그대로다.
//
// **`weddingDate`가 항상 존재한다고 가정한다(string, `| undefined` 아님).** `GET /dashboard/
// summary`(이 컴포넌트의 유일한 호출부가 쓰는 응답)는 온보딩에서 "미정"을 고른 웨딩도 D-day
// 계산을 위해 서버가 근사 날짜를 채워서 돌려준다 — `GET /weddings/me`(예산탭이 쓰던 응답)와
// 달리 undefined 분기가 없다. 근사값이어도 수정 폼 초기값으로는 합리적이다(사용자가 그 자리에서
// 실제 날짜로 고치면 됨).
//
// 날짜를 직접 입력하는 행위는 항상 EXACT 확정을 의미한다 — 온보딩 1단계(Step1RoleDate.tsx)가
// 날짜 입력=EXACT로 두는 것과 같은 규칙. wedding_date_precision을 함께 보내는 이유도 그것이다
// — 서버는 EXACT가 아니면 보낸 날짜를 무시하고 근사 규칙으로 대체한다(03_API_spec.md #6 필드 표).
import { useState } from "react";
import { updateMyWedding } from "@/entities/wedding";
import { ApiError } from "@/shared/api";

const INLINE_DATE_INPUT = "min-h-tap w-40 rounded-md border border-line bg-surface px-2.5 text-base text-ink focus-visible:border-primary";
const GHOST_BUTTON = "text-xs font-bold text-ink-soft transition-colors duration-150 hover:text-primary";

export interface WeddingDateEditProps {
  weddingDate: string;
  onSaved: (nextDate: string) => void;
}

export function WeddingDateEdit({ weddingDate, onSaved }: WeddingDateEditProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function startEdit() {
    setDraft(weddingDate);
    setSaveState("idle");
    setErrorMessage(null);
  }

  function cancelEdit() {
    setDraft(null);
    setSaveState("idle");
    setErrorMessage(null);
  }

  async function handleSave() {
    if (draft === null || draft === "") return;
    const nextDate = draft;
    setSaveState("saving");
    setErrorMessage(null);
    try {
      await updateMyWedding({ wedding_date: nextDate, wedding_date_precision: "EXACT" });
      onSaved(nextDate);
      setDraft(null);
      setSaveState("idle");
    } catch (err) {
      setSaveState("error");
      setErrorMessage(err instanceof ApiError ? err.message : "결혼식 날짜를 저장하지 못했어요. 다시 시도해 주세요.");
    }
  }

  if (draft === null) {
    return (
      <button type="button" onClick={startEdit} className={GHOST_BUTTON}>
        수정
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <input
        type="date"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className={INLINE_DATE_INPUT}
        aria-label="결혼식 날짜"
      />
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saveState === "saving" || draft === ""}
        className={GHOST_BUTTON}
      >
        {saveState === "saving" ? "저장 중…" : "저장"}
      </button>
      {/* 저장 진행 중엔 취소를 막는다 — 안 막으면 취소 후에도 진행 중이던 저장이 성공 시
          되살아난다(레드팀 감사 HIGH, 예전 BudgetPage.tsx 총예산 편집과 같은 이유). */}
      <button type="button" onClick={cancelEdit} disabled={saveState === "saving"} className={GHOST_BUTTON}>
        취소
      </button>
      {saveState === "error" && (
        <span role="alert" className="basis-full text-xs text-primary">
          {errorMessage}
        </span>
      )}
    </span>
  );
}
