// "결혼식 날짜" 인라인 수정 폼의 **안쪽**. 왜 이 컴포넌트가 존재하는지·무엇을 가정하는지는
// 짝인 `WeddingDateEdit.tsx` 머리말에 있다(그쪽이 진입점이다).
//
// ## 왜 파일이 갈렸는가 — 초기 청크 (D20)
//
// 대시보드는 **유일하게 정적 import 되는 화면**이라(app/router/router.tsx §코드 스플리팅) 여기
// 딸린 것은 전부 초기 청크가 된다. 그런데 이 폼은 사용자가 「수정」을 누르기 전까지 화면에
// 없다 — 평소에 있는 것은 12px 짜리 버튼 하나뿐이다. `DateField` + 날짜 계산 라이브러리를
// 그 버튼과 함께 초기 청크에 실으면 **한 번도 안 누르는 사람까지 그 바이트를 받는다.**
// 이 저장소는 그 바이트가 폰트 시작을 밀어 LCP 로 이어진다는 것을 실측해 뒀다.
//
// 그래서 진입점이 이 파일을 `React.lazy` 로 가져가고, 「수정」 버튼에 포인터/포커스가 닿는
// 순간 미리 받아 둔다. 실측: 이 분리로 초기 청크가 101.8 kB → 99.0 kB 로 돌아왔다.
import { useState } from "react";
import { updateMyWedding } from "@/entities/wedding";
import { ApiError } from "@/shared/api";
import { DateField } from "@/shared/ui";

// [D20] `w-40`(160px) 짜리 `<input type="date">` 였다. 그 폭은 네이티브 컨트롤의 서식 표시를
// 겨우 담는 크기라 탭 목표가 좁았고, 무엇보다 **자체 캘린더는 폭을 필요로 한다**(7열 × 44px).
// 그래서 편집 중에는 이 줄이 자기 줄을 통째로 쓴다 — 부모가 이미 `flex-wrap` 이라
// `basis-full` 한 마디로 끝난다(에러 문구가 쓰던 것과 같은 수법).
const INLINE_DATE_FIELD = "basis-full";
const INLINE_DATE_INPUT =
  "min-h-tap w-full rounded-md border border-line bg-surface px-2.5 text-base text-ink focus-visible:border-primary";
const GHOST_BUTTON = "text-xs font-bold text-ink-soft transition-colors duration-150 hover:text-primary";

export interface WeddingDateEditFormProps {
  weddingDate: string;
  /** 저장 성공. 폼을 닫는 것은 호출부 몫이다. */
  onSaved: (nextDate: string) => void;
  onCancel: () => void;
}

export function WeddingDateEditForm({ weddingDate, onSaved, onCancel }: WeddingDateEditFormProps) {
  const [draft, setDraft] = useState(weddingDate);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSave() {
    if (draft === "") return;
    setSaveState("saving");
    setErrorMessage(null);
    try {
      await updateMyWedding({ wedding_date: draft, wedding_date_precision: "EXACT" });
      onSaved(draft);
    } catch (err) {
      setSaveState("error");
      setErrorMessage(err instanceof ApiError ? err.message : "결혼식 날짜를 저장하지 못했어요. 다시 시도해 주세요.");
    }
  }

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {/* min/max 를 두지 않는다 — 온보딩의 「결혼 예정일」과 달리 이 칸은 **이미 치른 결혼의
          날짜를 고치는 경로**이기도 하다(서버가 근사 날짜를 채워 둔 경우의 정정 포함). */}
      <DateField
        value={draft}
        onChange={setDraft}
        disabled={saveState === "saving"}
        wrapClassName={INLINE_DATE_FIELD}
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
      <button type="button" onClick={onCancel} disabled={saveState === "saving"} className={GHOST_BUTTON}>
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
