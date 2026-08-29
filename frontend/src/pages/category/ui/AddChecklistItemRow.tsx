// "+ 항목 추가" — 사용자 커스텀 체크리스트 항목(POST /checklist-items, origin=USER). 모달 없이
// 인라인으로 펼치는 이 저장소 관례(AddPaymentRow.tsx)를 따른다. group_label 기본값은 item_type의
// 그룹 라벨(ChecklistTab.tsx GROUP_LABEL)로 채워서, 굳이 고르지 않아도 자연스러운 값이 들어가게 한다.
import { useId, useState } from "react";
import { CHECKLIST_TITLE_MAX_LENGTH, createChecklistItem, type ChecklistItemType, type ChecklistPriority } from "@/entities/checklist";
import { ApiError } from "@/shared/api";
import { Select } from "@/shared/ui";

const ADD_BTN =
  "w-full rounded-sm border border-dashed border-line bg-transparent py-2.5 text-sm font-bold text-ink-soft";
const FORM_INPUT = "min-h-tap w-full rounded-md border border-line bg-surface px-2.5 text-base text-ink";

const ITEM_TYPE_LABEL: Record<ChecklistItemType, string> = {
  CONTRACT_TERM: "계약 조항",
  EXTRA_COST: "추가 비용",
  PREP: "준비 사항",
};
const PRIORITY_LABEL: Record<ChecklistPriority, string> = { high: "높음", mid: "보통", low: "낮음" };

// [D22] `Select` 는 `{ value, label }` 목록을 받는다. 라벨 맵이 이미 단일 출처라 여기서 한 번만 옮긴다.
const ITEM_TYPE_OPTIONS = Object.entries(ITEM_TYPE_LABEL).map(([value, label]) => ({ value, label }));
const PRIORITY_OPTIONS = Object.entries(PRIORITY_LABEL).map(([value, label]) => ({ value, label }));

interface AddChecklistItemRowProps {
  categoryCode: string;
  onAdded: () => void;
}

export function AddChecklistItemRow({ categoryCode, onAdded }: AddChecklistItemRowProps) {
  // 같은 화면에 카테고리별로 여러 번 마운트될 수 있어 고정 id 를 쓰지 않는다(AddPaymentRow 와 같은 처리).
  const itemTypeId = useId();
  const priorityId = useId();
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
      {/* [D22] `<label>` 로 감싸지 않고 `htmlFor` 로 잇는다 — `Select` 는 래퍼 안에 컨트롤을
          그리므로 감싸면 린터가 연결을 못 알아본다. `CostTab` 의 견적 칸(`NumberInput`)이 같은
          이유로 이미 같은 배선을 쓴다. */}
      <label className="flex flex-col gap-1 text-xs text-ink-soft" htmlFor={itemTypeId}>
        항목 유형
        <Select
          id={itemTypeId}
          className="w-full"
          value={itemType}
          onValueChange={(next) => setItemType(next as ChecklistItemType)}
          options={ITEM_TYPE_OPTIONS}
        />
      </label>
      <input
        className={FORM_INPUT}
        aria-label="항목 이름"
        placeholder="항목 이름"
        value={title}
        maxLength={CHECKLIST_TITLE_MAX_LENGTH}
        onChange={(e) => setTitle(e.target.value)}
      />
      <label className="flex flex-col gap-1 text-xs text-ink-soft" htmlFor={priorityId}>
        중요도
        <Select
          id={priorityId}
          className="w-full"
          value={priority}
          onValueChange={(next) => setPriority(next as ChecklistPriority)}
          options={PRIORITY_OPTIONS}
        />
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
