// "+ 항목 추가" — 사용자 커스텀 체크리스트 항목(POST /checklist-items, origin=USER). 모달 없이
// 인라인으로 펼치는 이 저장소 관례(AddPaymentRow.tsx)를 따른다. group_label 기본값은 item_type의
// 그룹 라벨(ChecklistTab.tsx GROUP_LABEL)로 채워서, 굳이 고르지 않아도 자연스러운 값이 들어가게 한다.
import { useState } from "react";
import { CHECKLIST_TITLE_MAX_LENGTH, createChecklistItem, type ChecklistItemType, type ChecklistPriority } from "@/entities/checklist";
import { ApiError } from "@/shared/api";

const ADD_BTN =
  "w-full rounded-sm border border-dashed border-line bg-transparent py-2.5 text-sm font-bold text-ink-soft";
const FORM_INPUT = "min-h-tap w-full rounded-md border border-line bg-surface px-2.5 text-base text-ink";

const ITEM_TYPE_LABEL: Record<ChecklistItemType, string> = {
  CONTRACT_TERM: "계약 조항",
  EXTRA_COST: "추가 비용",
  PREP: "준비 사항",
};
const PRIORITY_LABEL: Record<ChecklistPriority, string> = { high: "높음", mid: "보통", low: "낮음" };

interface AddChecklistItemRowProps {
  categoryCode: string;
  onAdded: () => void;
}

export function AddChecklistItemRow({ categoryCode, onAdded }: AddChecklistItemRowProps) {
  const [open, setOpen] = useState(false);
  const [itemType, setItemType] = useState<ChecklistItemType>("PREP");
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<ChecklistPriority>("mid");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function reset() {
    setItemType("PREP");
    setTitle("");
    setPriority("mid");
    setError(null);
  }

  async function handleSubmit() {
    if (!title.trim()) {
      setError("항목 이름을 입력해 주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createChecklistItem({
        category_code: categoryCode,
        item_type: itemType,
        group_label: ITEM_TYPE_LABEL[itemType],
        title: title.trim(),
        priority,
      });
      // 폼이 바로 닫혀 성공 메시지를 보여줄 자리가 없다 — 스크린리더 사용자는 실패(아래
      // role="alert")만 안내받고 성공은 알 방법이 없었다(접근성 감사 2026-08-26). 폼 바깥에
      // 항상 떠 있는 sr-only 영역에 잠깐 담아 announce한다.
      setSuccessMessage(`"${title.trim()}" 항목을 추가했어요.`);
      reset();
      setOpen(false);
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "항목을 추가하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <>
        {/* 폼이 닫혀도 방금 추가 성공 announce는 살아있어야 한다. */}
        <output className="sr-only">{successMessage}</output>
        <button
          type="button"
          className={ADD_BTN}
          onClick={() => {
            setSuccessMessage(null);
            setOpen(true);
          }}
        >
          + 항목 추가
        </button>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-line bg-bg p-3">
      <label className="flex flex-col gap-1 text-xs text-ink-soft">
        항목 유형
        <select
          className={FORM_INPUT}
          value={itemType}
          onChange={(e) => setItemType(e.target.value as ChecklistItemType)}
        >
          {Object.entries(ITEM_TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <input
        className={FORM_INPUT}
        aria-label="항목 이름"
        placeholder="항목 이름"
        value={title}
        maxLength={CHECKLIST_TITLE_MAX_LENGTH}
        onChange={(e) => setTitle(e.target.value)}
      />
      <label className="flex flex-col gap-1 text-xs text-ink-soft">
        중요도
        <select className={FORM_INPUT} value={priority} onChange={(e) => setPriority(e.target.value as ChecklistPriority)}>
          {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="text-xs text-primary">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={saving}
          className="min-h-tap flex-1 rounded-md bg-primary text-sm font-bold text-surface disabled:opacity-50"
        >
          {saving ? "저장 중…" : "추가"}
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="min-h-tap flex-1 rounded-md border border-line bg-surface text-sm font-bold text-ink-soft"
        >
          취소
        </button>
      </div>
    </div>
  );
}
