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
// **수정 범위는 제목(item_name)·금액·날짜뿐이다** — 카테고리·업체명·결제 유형은 이번 요청
// 범위 밖이라 안 넣는다. 날짜는 이미 채워진 필드(paid_date 있으면 결제일, 없으면 예정일)만
// 고친다 — "예정"을 "지급완료"로 바꾸는 상태 전환 UI는 아니다. 이 좁은 범위 덕분에 백엔드의
// PATCH 상태 자동유도 계약(status 생략 시 paid_date만으로 PAID 자동유도, dd435d1)을 이 화면이
// 건드릴 일이 아예 없다 — PLANNED 건은 paid_date가 항상 null이라 due_date만 보내고,
// PAID/CANCELED 건은 이미 채워진 paid_date를 다른 값으로 고칠 뿐 새로 채우는 게 아니다.
//
// **삭제 확인도 모달이 아니라 인라인 전환**이다("정말 삭제할까요?" + 삭제/취소) — 이 저장소엔
// danger 색 토큰이 아예 없다(D6) — 새로 만들지 않고 기존 에러 문구와 같은 text-primary 굵은
// 글씨만 쓴다.
import { useState } from "react";
import { ApiError } from "@/shared/api";
import { Badge, Money } from "@/shared/ui";
import { deletePayment, patchPayment } from "../api/payment";
import type { Payment, PaymentPatchInput } from "../model";
import { PAYMENT_TYPE_BADGE_CLASS, PAYMENT_TYPE_LABEL } from "./payment-labels";

const ROW_INPUT = "min-h-tap w-full rounded-md border border-line bg-surface px-2.5 text-sm text-ink";
const GHOST_BUTTON = "text-xs font-bold text-ink-soft transition-colors duration-150 hover:text-primary";
const PRIMARY_BUTTON = "min-h-tap flex-1 rounded-md bg-primary text-xs font-bold text-surface disabled:opacity-50";
const LINE_BUTTON = "min-h-tap flex-1 rounded-md border border-line bg-surface text-xs font-bold text-ink-soft disabled:opacity-50";
const DELETE_CONFIRM_BUTTON =
  "min-h-tap rounded-md border border-primary bg-primary-soft px-3 text-xs font-bold text-primary disabled:opacity-50";

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
  const [draftAmount, setDraftAmount] = useState("");
  const [draftDate, setDraftDate] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // paid_date가 있으면(PAID/CANCELED) 그 날짜를, 없으면(PLANNED) due_date를 고친다 — 위 머리말
  // 설명대로 "이미 채워진 필드"만 편집 대상이다.
  const editsPaidDate = p.paid_date !== null;
  const dateLabel = editsPaidDate ? "결제일" : "예정일";

  function startEdit() {
    setDraftName(p.item_name);
    setDraftAmount(String(p.amount));
    setDraftDate((editsPaidDate ? p.paid_date : p.due_date) ?? "");
    setSaveState("idle");
    setErrorMessage(null);
    setMode("editing");
  }

  function cancelEdit() {
    setMode("idle");
    setSaveState("idle");
    setErrorMessage(null);
  }

  async function handleSave() {
    const parsedAmount = Number(draftAmount);
    if (!draftName || !Number.isFinite(parsedAmount) || parsedAmount <= 0 || !draftDate) {
      setSaveState("error");
      setErrorMessage("항목명·금액·날짜를 모두 올바르게 입력해 주세요.");
      return;
    }
    setSaveState("saving");
    setErrorMessage(null);
    try {
      const patch: PaymentPatchInput = editsPaidDate
        ? { item_name: draftName, amount: parsedAmount, paid_date: draftDate }
        : { item_name: draftName, amount: parsedAmount, due_date: draftDate };
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
          <p role="alert" className="text-sm font-bold text-primary">
            「{p.item_name}」 삭제할까요?
          </p>
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
        <div className="flex items-center gap-2">
          <Badge className={PAYMENT_TYPE_BADGE_CLASS[p.payment_type]}>{PAYMENT_TYPE_LABEL[p.payment_type] ?? p.payment_type}</Badge>
          {categoryLabel !== undefined && <Badge>{categoryLabel}</Badge>}
          <span className="text-xs font-bold text-primary">수정 중</span>
        </div>
        <input className={ROW_INPUT} aria-label="항목명" value={draftName} onChange={(e) => setDraftName(e.target.value)} />
        <div className="flex gap-2">
          <input
            className={`${ROW_INPUT} [font-variant-numeric:tabular-nums]`}
            type="number"
            min={0}
            aria-label="금액(원)"
            value={draftAmount}
            onChange={(e) => setDraftAmount(e.target.value)}
          />
          <input
            className={`${ROW_INPUT} [font-variant-numeric:tabular-nums]`}
            type="date"
            aria-label={dateLabel}
            value={draftDate}
            onChange={(e) => setDraftDate(e.target.value)}
          />
        </div>
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
        <div className="flex items-center gap-2">
          <Badge className={PAYMENT_TYPE_BADGE_CLASS[p.payment_type]}>{PAYMENT_TYPE_LABEL[p.payment_type] ?? p.payment_type}</Badge>
          {categoryLabel !== undefined && <Badge>{categoryLabel}</Badge>}
          <p className="truncate text-sm font-bold text-ink">{p.item_name}</p>
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
