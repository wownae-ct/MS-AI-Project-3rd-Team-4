// "+ 항목 추가" — 사용자 커스텀 타임라인 항목(POST /timeline-items, origin=USER). 모달 없이
// 인라인으로 펼치는 이 저장소 관례(pages/category/ui/AddPaymentRow.tsx)를 따른다. category_code는
// 선택이다 — 혼인신고·본식처럼 카테고리 무관 항목이 실제로 있다(entities/timeline/model.ts 머리말).
import { useEffect, useState } from "react";
import { createTimelineItem } from "@/entities/timeline";
import { getCategories, type CategoryConstant } from "@/entities/wedding";
import { ApiError } from "@/shared/api";

const ADD_BTN =
  "w-full rounded-sm border border-dashed border-line bg-transparent py-2.5 text-sm font-bold text-ink-soft";
const FORM_INPUT = "min-h-tap w-full rounded-md border border-line bg-surface px-2.5 text-sm text-ink";

interface AddTimelineItemRowProps {
  onAdded: () => void;
}

export function AddTimelineItemRow({ onAdded }: AddTimelineItemRowProps) {
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<CategoryConstant[] | null>(null);
  const [categoryCode, setCategoryCode] = useState<string>("");
  const [title, setTitle] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open || categories !== null) return;
    getCategories()
      .then((res) => setCategories(res.categories.toSorted((a, b) => a.display_order - b.display_order)))
      .catch(() => {
        // 카테고리 목록은 보조 입력이다 — 못 불러와도 "무관"으로 계속 추가할 수 있어야 한다.
        setCategories([]);
      });
  }, [open, categories]);

  function reset() {
    setCategoryCode("");
    setTitle("");
    setTargetDate("");
    setError(null);
  }

  async function handleSubmit() {
    if (!title.trim() || !targetDate) {
      setError("항목 이름과 날짜를 입력해 주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createTimelineItem({
        category_code: categoryCode === "" ? null : categoryCode,
        title: title.trim(),
        target_date: targetDate,
      });
      // 폼이 바로 닫혀 성공 메시지를 보여줄 자리가 없다 — 스크린리더 사용자는 실패(아래
      // role="alert")만 안내받고 성공은 알 방법이 없었다(접근성 감사 2026-08-26).
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
      <select
        className={FORM_INPUT}
        aria-label="카테고리"
        value={categoryCode}
        onChange={(e) => setCategoryCode(e.target.value)}
      >
        <option value="">카테고리 무관</option>
        {categories?.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name_ko}
          </option>
        ))}
      </select>
      <input
        className={FORM_INPUT}
        aria-label="항목 이름"
        placeholder="항목 이름"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <input
        className={FORM_INPUT}
        type="date"
        aria-label="날짜"
        value={targetDate}
        onChange={(e) => setTargetDate(e.target.value)}
      />
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
