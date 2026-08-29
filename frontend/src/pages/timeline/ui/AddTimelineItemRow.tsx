// "+ 항목 추가" — 사용자 커스텀 타임라인 항목(POST /timeline-items, origin=USER). 모달 없이
// 인라인으로 펼치는 이 저장소 관례(pages/category/ui/AddPaymentRow.tsx)를 따른다. category_code는
// 선택이다 — 혼인신고·본식처럼 카테고리 무관 항목이 실제로 있다(entities/timeline/model.ts 머리말).
import { useEffect, useState } from "react";
import { createTimelineItem } from "@/entities/timeline";
import { getCategories, type CategoryConstant } from "@/entities/wedding";
import { ApiError } from "@/shared/api";
import { futureQuickPicks, todayISO } from "@/shared/lib/date";
import { DateField } from "@/shared/ui";

const ADD_BTN =
  "w-full rounded-sm border border-dashed border-line bg-transparent py-2.5 text-sm font-bold text-ink-soft";
// [2026-08-29] `text-sm`(14px) 이었다 — 「입력 필드 16px 미만 금지」 규범 위반(a11y.md §2.5).
// iOS Safari 가 16px 미만 입력에 포커스 시 화면을 자동 확대하고 되돌리지 않는다. 같은 폼의
// `AddChecklistItemRow`/`AddPaymentRow` 는 처음부터 `text-base` 였다 — 이 파일만 갈려 있었다.
const FORM_INPUT = "min-h-tap w-full rounded-md border border-line bg-surface px-2.5 text-base text-ink";

interface AddTimelineItemRowProps {
  /** 캘린더에 기준선으로 표시할 결혼식 날짜. `TimelinePage` 가 이미 들고 있는 값을 내려준다
      (여기서 `GET /weddings/me` 를 새로 부르지 않는다) — 없을 수도 있다(온보딩에서 "미정"). */
  weddingDate?: string;
  onAdded: () => void;
}

export function AddTimelineItemRow({ weddingDate, onAdded }: AddTimelineItemRowProps) {
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
      {/* [D20] `<input type="date">` 였다. 타임라인 항목은 「대략 3주 뒤」처럼 **오늘 기준 상대
          시점**으로 떠올리는 일이 대부분이라 빠른 선택 칩이 그 계산을 대신한다. 결혼식 날짜는
          그리드에 밑줄로 표시해 "본식 전인가 후인가"를 고르는 순간 볼 수 있게 한다. */}
      <DateField
        className={FORM_INPUT}
        aria-label="날짜"
        value={targetDate}
        onChange={setTargetDate}
        quickPicks={futureQuickPicks(todayISO())}
        markedDate={weddingDate}
        markedLabel="결혼식 날짜"
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
