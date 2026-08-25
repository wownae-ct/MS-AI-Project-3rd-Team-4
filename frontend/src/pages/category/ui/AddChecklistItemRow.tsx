// "+ 항목 추가" — 사용자 커스텀 체크리스트 항목(POST /checklist-items, origin=USER). 모달 없이
// 인라인으로 펼치는 이 저장소 관례(AddPaymentRow.tsx)를 따른다. group_label 기본값은 item_type의
// 그룹 라벨(ChecklistTab.tsx GROUP_LABEL)로 채워서, 굳이 고르지 않아도 자연스러운 값이 들어가게 한다.
import { useState } from "react";
import { createChecklistItem, type ChecklistItemType, type ChecklistPriority } from "@/entities/checklist";
import { ApiError } from "@/shared/api";

const ADD_BTN =
  "w-full rounded-sm border border-dashed border-line bg-transparent py-2.5 text-sm font-bold text-ink-soft";
const FORM_INPUT = "min-h-tap w-full rounded-md border border-line bg-surface px-2.5 text-sm text-ink";

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
      <button type="button" className={ADD_BTN} onClick={() => setOpen(true)}>
        + 항목 추가
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-line bg-bg p-3">
      <select className={FORM_INPUT} value={itemType} onChange={(e) => setItemType(e.target.value as ChecklistItemType)}>
        {Object.entries(ITEM_TYPE_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <input className={FORM_INPUT} placeholder="항목 이름" value={title} onChange={(e) => setTitle(e.target.value)} />
      <select className={FORM_INPUT} value={priority} onChange={(e) => setPriority(e.target.value as ChecklistPriority)}>
        {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
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
