// 지난 대화 목록의 한 줄 — 선택 + 삭제 (사용자 요청 2026-08-30 「지난 대화기록을 삭제하는 기능」).
//
// **왜 파일을 나눴나.** 종전에 이 행은 `ChatHistoryDrawer.tsx` 안의 `<button>` **하나**였다.
// 삭제 버튼이 붙으면서 두 가지가 동시에 바뀐다 — ① 버튼 안에 버튼을 넣을 수 없으므로 행이
// 「감싸는 `<div>` + 선택 버튼 + 삭제 버튼」 3층이 되고 ② idle ↔ 확인 ↔ 진행 3갈래 렌더가 생긴다.
// 드로어 본체에 그대로 두면 `eslint/max-lines`(300, 주석 제외)에 걸리고, 무엇보다 드로어의 관심사
// (언제 조회하고 무엇을 거르는가)와 행의 관심사(이 한 줄을 어떻게 그리는가)가 섞인다.
//
// **상태는 여기 없다 — 전부 드로어가 준다.** 확인 중인 행이 화면에 **하나뿐**이어야 하기 때문이다.
// 행이 스스로 `confirming` 을 들고 있으면 여러 줄이 동시에 「삭제할까요?」로 펼쳐질 수 있고, 그중
// 어느 것을 눌렀는지 사용자가 헷갈린다. 소유권을 드로어에 두면 그 상태가 구조적으로 하나가 된다.
//
// **확인은 모달이 아니라 제자리 전환이다** — `entities/payment/ui/PaymentListRow.tsx` 의 삭제 관례
// 그대로다. `shared/ui/ConfirmDialog` 를 쓰지 않는 이유는 둘이다: ① 드로어가 이미 `showModal()` 한
// `<dialog>` 라 모달이 2겹이 된다 ② 320px 드로어 안에서 화면 중앙 모달이 뜨면 **어느 대화를
// 지우는지** 맥락이 끊긴다. 제자리 전환은 지울 대상 위에서 그대로 되묻는다.
//
// 규범 준수: danger 색 토큰은 이 저장소에 없다(D6) — 파괴적 행동도 기존 에러와 같은 `text-primary`
// 를 쓴다. 화면에 문자 글리프를 렌더하지 않는다(D18) — 휴지통 아이콘 대신 낱말 「삭제」다.
import type { ChatSessionSummary } from "@/entities/chat";

// 모듈 스코프에 한 번만 만든다 — `Intl.DateTimeFormat` 생성은 렌더마다 할 만큼 싸지 않다
// (`shared/ui/Money.tsx` 와 같은 처리).
//
// 연도를 넣지 않는다 — 목록은 최근 순이고 사용자가 실제로 스캔하는 것은 "며칠 전인가"다.
// 해를 넘긴 대화가 쌓이면 그때 다시 볼 문제이지, 지금 넣으면 모든 행이 길어지기만 한다.
const SESSION_DATE = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" });

function formatSessionDate(session: ChatSessionSummary): string {
  // `last_message_at` 이 우선이고 없으면 생성 시각 — 백엔드 정렬 기준(`last_message_at desc
  // nulls_last, created_at desc`)과 같은 순서로 고른다. 표시와 정렬이 다른 값을 보면 목록이
  // 뒤죽박죽으로 보인다.
  const raw = session.last_message_at ?? session.created_at;
  const parsed = new Date(raw);
  // 서버가 보낸 문자열을 브라우저가 못 읽는 경우까지 화면이 깨지진 않게 한다 — 날짜는 보조
  // 정보이고 제목이 본체다.
  return Number.isNaN(parsed.getTime()) ? "" : SESSION_DATE.format(parsed);
}

// 선택 버튼 두 리터럴은 **선택 상태를 두 채널로** 알린다(WCAG 1.4.1 — 색 하나로만 상태를 전달하지
// 않는다): 테두리·바탕 + 제목 굵기. `MessageBubble.tsx` 의 평가 버튼이 쓰는 것과 같은 조합이다.
//
// ⚠️ 종전의 `w-full` 이 `min-w-0 flex-1` 로 바뀌었다 — 이제 이 버튼은 flex 행의 아이템이고,
// `min-w-0` 이 없으면 긴 제목의 내재 폭 밑으로 안 줄어들어 삭제 버튼을 드로어 밖으로 밀어낸다.
const ROW =
  "flex min-h-tap min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5 rounded-md border " +
  "border-transparent px-3 py-2 text-left transition-colors duration-150 hover:border-line hover:bg-bg";
const ROW_CURRENT =
  "flex min-h-tap min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5 rounded-md border " +
  "border-primary bg-primary-soft px-3 py-2 text-left transition-colors duration-150";
const ROW_TITLE = "w-full truncate text-sm text-ink";
const ROW_TITLE_CURRENT = "w-full truncate text-sm font-bold text-primary";

// 🚨 상자를 **실제로** 44×44 로 그린다. a11y.md §1.5 의 「36px 상자 + 의사요소로 히트 영역만 44px」
// 수법은 **목록의 인접 행에 쓸 수 없다** — 넘친 히트 영역이 위아래 이웃의 클릭을 뺏는다.
// 그 문서가 같은 이유로 `Select` 팝업 항목을 44px 그대로 둔 것과 같은 판단이다.
const ROW_DELETE =
  "inline-flex min-h-tap min-w-tap shrink-0 cursor-pointer items-center justify-center rounded-md " +
  "border border-transparent text-xs font-bold text-ink-soft transition-colors duration-150 " +
  "hover:border-line hover:bg-bg hover:text-primary";

const CONFIRM_WRAP = "flex flex-col gap-2 rounded-md border border-line bg-bg px-3 py-2";
const CONFIRM_QUESTION = "text-sm font-bold text-primary";
const CONFIRM_NOTE = "text-xs text-ink-soft";
const CONFIRM_ERROR = "text-xs text-primary";
const CONFIRM_DELETE =
  "min-h-tap flex-1 cursor-pointer rounded-md border border-primary bg-primary-soft text-xs " +
  "font-bold text-primary disabled:opacity-50";
const CONFIRM_CANCEL =
  "min-h-tap flex-1 cursor-pointer rounded-md border border-line bg-surface text-xs font-bold " +
  "text-ink-soft disabled:opacity-50";

export interface ChatHistoryRowProps {
  session: ChatSessionSummary;
  /** 지금 화면에 열려 있는 대화인가. */
  isCurrent: boolean;
  /** 이 행이 삭제 확인 중인가 — 드로어가 「한 번에 하나」를 보장한다. */
  confirming: boolean;
  /** 이 행의 삭제 요청이 진행 중인가. */
  deleting: boolean;
  /** 이 행의 삭제가 실패했을 때의 문구. 성공하면 행 자체가 사라지므로 여기 올 일이 없다. */
  error: string | null;
  onSelect: (sessionId: string) => void;
  onAskDelete: (sessionId: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (sessionId: string) => void;
}

export function ChatHistoryRow({
  session,
  isCurrent,
  confirming,
  deleting,
  error,
  onSelect,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: ChatHistoryRowProps) {
  const title = session.title ?? "새 대화";

  if (confirming) {
    return (
      <div className={CONFIRM_WRAP}>
        {/* role="alert" — 목록을 훑던 스크린리더 사용자에게 이 행이 되묻는 상태로 바뀐 사실을
            알린다(PaymentListRow 의 삭제 확인과 같은 처리). */}
        <p role="alert" className={CONFIRM_QUESTION}>
          「{title}」 삭제할까요?
        </p>
        <p className={CONFIRM_NOTE}>주고받은 메시지가 함께 사라지고 되돌릴 수 없어요.</p>
        {error !== null && <p className={CONFIRM_ERROR}>{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={() => onConfirmDelete(session.id)} disabled={deleting} className={CONFIRM_DELETE}>
            {deleting ? "삭제 중…" : "삭제"}
          </button>
          {/* 진행 중엔 취소를 막는다 — 안 막으면 취소 후에도 진행 중이던 삭제가 성공한다
              (레드팀 감사 HIGH, PaymentListRow·WeddingDateEdit 이 같은 이유로 같은 처리를 한다). */}
          <button type="button" onClick={onCancelDelete} disabled={deleting} className={CONFIRM_CANCEL}>
            취소
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        // 목록 안의 "지금 여기" 표시는 `aria-current` 다 — `aria-selected` 는 탭·목록상자
        // 같은 특정 role 안에서만 뜻이 있다.
        aria-current={isCurrent ? "true" : undefined}
        onClick={() => onSelect(session.id)}
        className={isCurrent ? ROW_CURRENT : ROW}
      >
        <span className={isCurrent ? ROW_TITLE_CURRENT : ROW_TITLE}>{title}</span>
        <span className="text-xs text-ink-soft">{formatSessionDate(session)}</span>
      </button>
      {/* 접근명에 제목을 넣는다 — 목록에 「삭제」 버튼이 여러 개라 낱말만으로는 스크린리더가
          어느 대화의 것인지 구분하지 못한다. `title` 은 aria-label 과 **같은 문자열**로 준다
          (다르면 스크린리더가 둘 다 읽는다 — MessageBubble 평가 버튼과 같은 처리). */}
      <button
        type="button"
        aria-label={`「${title}」 삭제`}
        title={`「${title}」 삭제`}
        onClick={() => onAskDelete(session.id)}
        className={ROW_DELETE}
      >
        삭제
      </button>
    </div>
  );
}
