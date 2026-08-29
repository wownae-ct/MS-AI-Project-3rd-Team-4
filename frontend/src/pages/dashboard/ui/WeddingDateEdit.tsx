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
// **폼 본체는 `WeddingDateEditForm.tsx` 에 있고 첫 클릭 때 받아온다(D20).** 대시보드는 유일하게
// 정적 import 되는 화면이라 여기 딸린 것이 전부 초기 청크가 되는데, 폼은 「수정」을 누르기 전까지
// 화면에 없다 — 그 파일 머리말에 실측과 함께 적어 뒀다.
import { lazy, Suspense, useState } from "react";
import { Loading } from "@/shared/ui";

const WeddingDateEditForm = lazy(() =>
  import("./WeddingDateEditForm").then((mod) => ({ default: mod.WeddingDateEditForm })),
);

/** 「수정」에 포인터·포커스가 닿는 순간 폼 청크를 받아 둔다 — 누를 때는 이미 도착해 있다. */
function preloadForm() {
  void import("./WeddingDateEditForm");
}

const GHOST_BUTTON = "text-xs font-bold text-ink-soft transition-colors duration-150 hover:text-primary";

export interface WeddingDateEditProps {
  weddingDate: string;
  onSaved: (nextDate: string) => void;
}

export function WeddingDateEdit({ weddingDate, onSaved }: WeddingDateEditProps) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        onPointerEnter={preloadForm}
        onFocus={preloadForm}
        className={GHOST_BUTTON}
      >
        수정
      </button>
    );
  }

  return (
    // 사용자가 방금 누른 자리라 즉시 반응해야 하지만(D14 L1), 프리로드가 거의 항상 이겨서
    // 이 문구는 뜨지 않는다 — `Loading` 의 200ms 지연 게이트가 그 깜빡임을 막는다.
    <Suspense fallback={<Loading label="여는 중…" />}>
      <WeddingDateEditForm
        weddingDate={weddingDate}
        onSaved={(nextDate) => {
          onSaved(nextDate);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    </Suspense>
  );
}
