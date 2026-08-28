// 납부 내역 한 줄 — CostTab.tsx(카테고리별 비용 탭)에서 뽑아냈다(UX 개편 Phase 1, 2026-08-26) —
// 예산 페이지의 새 "비용 관리" 섹션(전 카테고리 통합 목록)이 같은 렌더를 재사용해야 하는데
// `pages/budget`은 `pages/category`를 import할 수 없다(.oxlintrc.json 「pages는 다른 pages
// 슬라이스를 못 넘본다」) — entities로 승격해야 양쪽이 쓸 수 있다.
//
// `categoryLabel`은 옵션이다 — S3 카테고리 상세(CostTab)는 이미 카테고리 화면 안이라 안 넘기고,
// 예산 페이지의 전 카테고리 통합 목록만 넘긴다. 안 넘기면 이 컴포넌트의 렌더는 CostTab의
// 기존 마크업과 바이트 단위로 동일하다.
//
// **수정/삭제(2026-08-27, 사용자 지시).** 그동안 `patchPayment`/`deletePayment`(entities/payment/
// api/payment.ts)는 존재하지만 아무 데서도 안 부르는 죽은 코드였다 — 이 컴포넌트가 처음 실제로
// 쓴다. idle→editing/deleting→saving→(idle|error) 상태 전이는 이 저장소의 기존 인라인 수정
// 관례(WeddingDateEdit.tsx, BudgetDonut.tsx 총예산 수정)를 그대로 따른다 — 모달 없음, 저장
// 진행 중엔 취소를 막는다(레드팀 감사 HIGH, 같은 이유: 취소 후에도 진행 중이던 저장이 성공하면
// 이미 취소한 값이 되살아난다).
//
// **수정 범위는 제목(item_name)·금액·날짜뿐이었다가, 상태 전환도 더해졌다.** 카테고리·업체명·
// 결제 유형은 여전히 범위 밖. 날짜는 기본적으로 이미 채워진 필드(paid_date 있으면 결제일,
// 없으면 예정일)만 고친다.
//
// **상태 전환(2026-08-27, 사용자 지시, PR #97 머지+배포 이후 추가)** — 처음엔 "예정"→"지급완료"
// 전환 UI를 의도적으로 뺐다(PR #97의 PATCH 상태 자동유도 계약이 아직 배포 전이라 반쪽짜리
// 동작 위험이 있었다). 이제 배포됐으므로 두 방향을 토글로 추가한다:
//   · PLANNED 건: "이미 결제했어요" 토글 — 켜면 날짜 필드가 예정일→결제일로 바뀌고(오늘 날짜로
//     프리필), 저장 시 paid_date만 보내고 status는 생략 — 서버가 PAID로 자동유도(dd435d1 계약).
//   · PAID 건: "환불 처리(취소)" 토글 — 켜면 저장 시 status: "CANCELED"를 명시적으로 보낸다.
//     paid_date는 그대로 유지(환불이어도 "언제 냈었는지" 기록은 남긴다 — CANCELED+paid_date는
//     모순이 아니라는 게 dev-e4 세션이 확인해 준 계약). CANCELED 건 자체는 이 토글이 안 뜬다
//     (되돌리기는 이번 요청 범위 밖).
// 조사 결과 `paid_amount`는 DB 컬럼이 아니라 `SUM(...) WHERE status='PAID'` 실시간 집계라
// (origin/backend 코드로 확인), 이 상태 전환도 삭제와 마찬가지로 별도 합계 보정 로직이 필요
// 없다 — status가 바뀌는 순간 다음 조회부터 집계에 자동 반영된다.
//
// **삭제 확인도 모달이 아니라 인라인 전환**이다("OOO 삭제할까요?" + 삭제/취소) — 이 저장소엔
// danger 색 토큰이 아예 없다(D6) — 새로 만들지 않고 기존 에러 문구와 같은 text-primary 굵은
// 글씨만 쓴다. 삭제 확인엔 상태별 보조 문구도 붙는다(PAID: 총 지불액에서 빠진다는 안내 —
// 이것도 위와 같은 이유로 이미 정확히 동작하는 기존 delete 흐름을 설명만 더하는 것뿐, 로직
// 변경은 없다).
import { useState } from "react";
import { ApiError } from "@/shared/api";
import { AMOUNT_STEP_WON } from "@/shared/lib/money";
import { Badge, Money, NumberInput } from "@/shared/ui";
import { deletePayment, patchPayment } from "../api/payment";
import type { Payment, PaymentPatchInput } from "../model";
import { PAYMENT_TYPE_BADGE_CLASS, PAYMENT_TYPE_LABEL } from "./payment-labels";

const ROW_INPUT = "min-h-tap w-full rounded-md border border-line bg-surface px-2.5 text-sm text-ink";
const GHOST_BUTTON = "text-xs font-bold text-ink-soft transition-colors duration-150 hover:text-primary";
const PRIMARY_BUTTON = "min-h-tap flex-1 rounded-md bg-primary text-xs font-bold text-surface disabled:opacity-50";
const LINE_BUTTON = "min-h-tap flex-1 rounded-md border border-line bg-surface text-xs font-bold text-ink-soft disabled:opacity-50";
const DELETE_CONFIRM_BUTTON =
  "min-h-tap rounded-md border border-primary bg-primary-soft px-3 text-xs font-bold text-primary disabled:opacity-50";
const TOGGLE_ROW = "flex items-center gap-2 rounded-md border border-line bg-bg px-2.5 py-2";
const TOGGLE_CHECKBOX = "size-[18px] accent-primary";
const TOGGLE_LABEL = "text-xs font-bold text-ink";
const HINT_TEXT = "text-xs font-bold text-primary";

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface PaymentListRowProps {
  payment: Payment;
  categoryLabel?: string;
  /** 수정 저장 또는 삭제 성공 시 호출 — 호출부가 목록 재조회 + (금액/상태가 바뀔 수 있으므로)
      카테고리 재조회를 태운다. */
  onChanged: () => void;
}

type Mode = "idle" | "editing" | "deleting";

export function PaymentListRow({ payment: p, categoryLabel, onChanged }: PaymentListRowProps) {
  const [mode, setMode] = useState<Mode>("idle");
  const [draftName, setDraftName] = useState("");
  // `number | null` — 빈 칸의 표현이 `""` 에서 `null` 로 옮겨갔다(NumberInput 계약).
  const [draftAmount, setDraftAmount] = useState<number | null>(null);
  const [draftDate, setDraftDate] = useState("");
  const [markAsPaid, setMarkAsPaid] = useState(false);
  const [markAsCanceled, setMarkAsCanceled] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isPlanned = p.status === "PLANNED";
  const isPaid = p.status === "PAID";
  // "이미 채워진 필드"가 원래 편집 대상이었다(PAID/CANCELED면 결제일, PLANNED면 예정일) —
  // markAsPaid 토글이 켜지면 PLANNED 건도 결제일 쪽으로 넘어간다.
  const willUsePaidDate = !isPlanned || markAsPaid;
  const dateLabel = willUsePaidDate ? "결제일" : "예정일";

  function startEdit() {
    setDraftName(p.item_name);
    setDraftAmount(p.amount);
    setDraftDate((isPlanned ? p.due_date : p.paid_date) ?? "");
    setMarkAsPaid(false);
    setMarkAsCanceled(false);
    setSaveState("idle");
    setErrorMessage(null);
    setMode("editing");
  }

  function cancelEdit() {
    setMode("idle");
    setSaveState("idle");
    setErrorMessage(null);
  }

  function handleTogglePaid(checked: boolean) {
    setMarkAsPaid(checked);
    setDraftDate(checked ? todayISODate() : (p.due_date ?? ""));
  }

  async function handleSave() {
    // 빈 칸(null)은 0으로 떨어뜨려 아래 `<= 0` 검증이 그대로 잡게 둔다.
    const parsedAmount = draftAmount ?? 0;
    if (!draftName || !Number.isFinite(parsedAmount) || parsedAmount <= 0 || !draftDate) {
      setSaveState("error");
      setErrorMessage("항목명·금액·날짜를 모두 올바르게 입력해 주세요.");
      return;
    }
    setSaveState("saving");
    setErrorMessage(null);
    try {
      const patch: PaymentPatchInput = willUsePaidDate
        ? { item_name: draftName, amount: parsedAmount, paid_date: draftDate }
        : { item_name: draftName, amount: parsedAmount, due_date: draftDate };
      // isPaid && markAsCanceled일 때만 status를 명시(환불) — PLANNED→PAID 전환은 status를
      // 생략해 서버 자동유도에 맡긴다(dd435d1 계약, 명시하면 자동유도가 안 걸린다).
      if (isPaid && markAsCanceled) patch.status = "CANCELED";
      await patchPayment(p.id, patch);
      setMode("idle");
      setSaveState("idle");
      onChanged();
    } catch (err) {
      setSaveState("error");
      setErrorMessage(err instanceof ApiError ? err.message : "저장하지 못했어요. 다시 시도해 주세요.");
    }
  }

  function startDelete() {
    setSaveState("idle");
    setErrorMessage(null);
    setMode("deleting");
  }

  function cancelDelete() {
    setMode("idle");
    setSaveState("idle");
    setErrorMessage(null);
  }

  async function handleDelete() {
    setSaveState("saving");
    setErrorMessage(null);
    try {
      await deletePayment(p.id);
      // 성공하면 이 행 자체가 부모 재조회로 사라진다 — mode를 되돌릴 필요 없다(언마운트됨).
      onChanged();
    } catch (err) {
      setSaveState("error");
      setErrorMessage(err instanceof ApiError ? err.message : "삭제하지 못했어요. 다시 시도해 주세요.");
    }
  }

  if (mode === "deleting") {
    return (
      <li className="flex flex-col gap-2 border-b border-line pb-3 last:border-0 last:pb-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <p role="alert" className="text-sm font-bold text-primary">
              「{p.item_name}」 삭제할까요?
            </p>
            {/* 실제 동작은 상태와 무관하게 이미 정확하다(paid_amount가 status='PAID' 조건의
                실시간 SUM 집계라 — 이 삭제가 그 조건에서 빠지는 순간 자동 반영된다). 이 문구는
                동작을 바꾸는 게 아니라 그 사실을 미리 알려주는 것뿐이다. */}
            <p className="text-xs text-ink-soft">
              {p.status === "PAID" ? (
                <>
                  이미 낸 <Money value={p.amount} className="text-xs" />이 총 지불액에서도 빠집니다.
                </>
              ) : (
                "아직 안 낸 항목이라 예산 금액엔 영향 없어요."
              )}
            </p>
          </div>
          <div className="flex flex-none gap-2">
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={saveState === "saving"}
              className={DELETE_CONFIRM_BUTTON}
            >
              {saveState === "saving" ? "삭제 중…" : "삭제"}
            </button>
            <button type="button" onClick={cancelDelete} disabled={saveState === "saving"} className={GHOST_BUTTON}>
              취소
            </button>
          </div>
        </div>
        {saveState === "error" && (
          <p role="alert" className="text-xs text-primary">
            {errorMessage}
          </p>
        )}
      </li>
    );
  }

  if (mode === "editing") {
    return (
      <li className="flex flex-col gap-2 border-b border-line pb-3 last:border-0 last:pb-0">
        {/* flex-wrap — 배지 2개가 이제 안 눌리므로(D16) 좁은 폭에서는 뒤따르는 텍스트가 다음
            줄로 내려가야 한다. 없으면 그 텍스트가 세로로 접힌다. */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={PAYMENT_TYPE_BADGE_CLASS[p.payment_type]}>{PAYMENT_TYPE_LABEL[p.payment_type] ?? p.payment_type}</Badge>
          {categoryLabel !== undefined && <Badge>{categoryLabel}</Badge>}
          <span className="text-xs font-bold text-primary">수정 중</span>
        </div>
        <input className={ROW_INPUT} aria-label="항목명" value={draftName} onChange={(e) => setDraftName(e.target.value)} />
        <div className="flex gap-2">
          <NumberInput
            wrapClassName="flex-1"
            className={`${ROW_INPUT} [font-variant-numeric:tabular-nums]`}
            step={AMOUNT_STEP_WON}
            min={0}
            aria-label="금액(원)"
            value={draftAmount}
            onValueChange={setDraftAmount}
          />
          <input
            className={`${ROW_INPUT} [font-variant-numeric:tabular-nums]`}
            type="date"
            aria-label={dateLabel}
            value={draftDate}
            disabled={markAsCanceled}
            onChange={(e) => setDraftDate(e.target.value)}
          />
        </div>
        {isPlanned && (
          <div className={TOGGLE_ROW}>
            <input
              type="checkbox"
              id={`mark-paid-${p.id}`}
              className={TOGGLE_CHECKBOX}
              checked={markAsPaid}
              onChange={(e) => handleTogglePaid(e.target.checked)}
            />
            <label htmlFor={`mark-paid-${p.id}`} className={TOGGLE_LABEL}>
              이미 결제했어요
            </label>
          </div>
        )}
        {isPaid && (
          <div className={TOGGLE_ROW}>
            <input
              type="checkbox"
              id={`mark-canceled-${p.id}`}
              className={TOGGLE_CHECKBOX}
              checked={markAsCanceled}
              onChange={(e) => setMarkAsCanceled(e.target.checked)}
            />
            <label htmlFor={`mark-canceled-${p.id}`} className={TOGGLE_LABEL}>
              환불 처리(취소)
            </label>
          </div>
        )}
        {markAsPaid && <p className={HINT_TEXT}>저장하면 「지급완료」로 바뀝니다.</p>}
        {markAsCanceled && <p className={HINT_TEXT}>저장하면 「취소됨」으로 바뀌고 총 지불액에서 빠집니다.</p>}
        {saveState === "error" && (
          <p role="alert" className="text-xs text-primary">
            {errorMessage}
          </p>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={() => void handleSave()} disabled={saveState === "saving"} className={PRIMARY_BUTTON}>
            {saveState === "saving" ? "저장 중…" : "저장"}
          </button>
          {/* 저장 진행 중엔 취소를 막는다 — 안 막으면 취소 후에도 진행 중이던 저장이 성공 시
              되살아난다(레드팀 감사 HIGH, WeddingDateEdit.tsx/BudgetDonut.tsx와 같은 이유). */}
          <button type="button" onClick={cancelEdit} disabled={saveState === "saving"} className={LINE_BUTTON}>
            취소
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 border-b border-line pb-3 last:border-0 last:pb-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        {/* flex-wrap + min-w-0 — 배지 2개가 이제 안 눌리므로(D16) 좁은 폭에서는 항목명이 다음
            줄로 내려가 거기서 전폭을 쓰고 잘린다. 종전엔 같은 줄에서 0px 까지 밀려 사라졌다. */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={PAYMENT_TYPE_BADGE_CLASS[p.payment_type]}>{PAYMENT_TYPE_LABEL[p.payment_type] ?? p.payment_type}</Badge>
          {categoryLabel !== undefined && <Badge>{categoryLabel}</Badge>}
          <p className="min-w-0 truncate text-sm font-bold text-ink">{p.item_name}</p>
        </div>
        <p className="text-xs text-ink-soft">
          {p.vendor_name ?? "업체명 미상"} ·{" "}
          {/* status는 PLANNED/PAID 2갈래만 아니라 CANCELED도 있다(backend/app/schemas/
              common.py:53) — 이걸 놓치면 취소된 결제가 "예정일..."로 잘못 보인다
              (레드팀 감사 라운드 2). 지금은 CANCELED로 바꾸는 UI가 없어 잠재적이지만,
              서버가 이미 이 값을 낼 수 있는 이상 렌더 쪽은 3갈래를 그대로 반영한다. */}
          {p.status === "PAID"
            ? `지급완료 ${p.paid_date ?? ""}`
            : p.status === "CANCELED"
              ? "취소됨"
              : `예정일 ${p.due_date ?? "미정"}`}
        </p>
      </div>
      <div className="flex flex-none items-center gap-2">
        <Money value={p.amount} className="shrink-0" />
        <button type="button" onClick={startEdit} className={GHOST_BUTTON}>
          수정
        </button>
        <button type="button" onClick={startDelete} className={GHOST_BUTTON}>
          삭제
        </button>
      </div>
    </li>
  );
}
