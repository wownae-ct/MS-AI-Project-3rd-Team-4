// AI상담 지난 대화 목록 (레드팀 감사 #17) — 좌측에서 덮는 오버레이 드로어.
//
// **왜 오버레이인가.** ChatGPT/Claude 식 상시 사이드바를 데스크톱에 두면 채팅 열이 그만큼
// 좁아진다 — 그런데 이 제품은 2026-08-26에 사용자 요청으로 채팅 칸을 **넓혔던** 이력이 있고
// (pages/chat/ui/ChatPage.tsx의 `md:max-w-3xl` 주석), `AppShell`이 이미 데스크톱 좌측에 세로
// 기둥을 하나 갖고 있어 둘을 더하면 기둥이 셋이 된다. top layer로 덮는 오버레이는 채팅 열의
// 폭도 높이도 1px 건드리지 않는다 — 목록이 순수하게 **더해지는** 기능이 된다.
//
// **왜 Base UI가 아니라 네이티브 `<dialog>`인가.** 이 저장소가 이미 내린 결정을 그대로 따른다 —
// `shared/ui/ConfirmDialog.tsx` 머리말에 실측이 있다(Base UI dialog는 floating-ui를 함께 끌고
// 와 gzip +21 kB, 번들 예산 초과). `showModal()`이 top layer 승격 · 포커스 트랩 · 배경 inert ·
// Esc 닫기 · 닫힌 뒤 트리거로 포커스 복귀를 전부 UA 구현으로 준다.
//
// **왜 `ConfirmDialog`를 재사용하지 않는가.** 그건 `role="alertdialog"` + 확인/취소 2버튼 +
// 바깥 클릭 무시로 **파괴적 행동 전용**으로 좁게 설계된 컴포넌트다. 여기는 `role="dialog"` +
// 목록 + 바깥 클릭으로 닫힘이라 계약이 다르다. 호출부가 하나뿐이라 지금 `shared/ui`로
// 일반화할 근거도 없다 — 그래서 `pages/chat` 안에 둔다.
//
// **[2026-08-30] 더 이상 읽기 전용이 아니다.** 이 머리말은 오래 *"백엔드에 세션 삭제·이름변경
// 엔드포인트가 없다"* 로 그 사실을 정당화해 왔다. 사용자 요청(2026-08-30 「지난 대화기록을 삭제하는
// 기능이 필요」)으로 **삭제만** 열었다 — 각 행이 자기 대화를 지운다(`ChatHistoryRow.tsx`).
// 이름변경은 여전히 없다.
// 🚨 백엔드 엔드포인트는 구현됐지만 **아직 머지·배포 전이다**(회신 2026-08-30, `fix/backend`).
// 계약 전문은 `docs/backend-analysis/BACKEND_REQUEST-2026-08-30-chat-session-delete.md`.
// 배포 순서가 뒤집히면 삭제가 실패 문구를 내는데, 그건 조용히 성공한 척하지 않는다는 뜻이라
// 안전한 실패다 — 아래 `confirmDelete` 의 `CHAT_SESSION_NOT_FOUND` 분기 주석 참고.
//
// 규범 준수 (docs/design/README.md): 그림자 없음 — 표면 구분은 1px 헤어라인 보더로만.
// 배경 가림막은 **요소 불투명도**로 만든다(D7 — 슬래시 알파는 산출 CSS가 8자리 hex로 접혀
// 팔레트 게이트에 걸린다). 화면에 문자 글리프를 렌더하지 않는다(D18) — 라벨은 전부 낱말이다.
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { deleteChatSession, listChatSessions, type ChatSessionSummary } from "@/entities/chat";
import { ApiError } from "@/shared/api";
import { Button, SkeletonRows } from "@/shared/ui";
import { ChatHistoryRow } from "./ChatHistoryRow";

// 닫혔을 때 숨기는 책임을 저자 스타일이 진다 — UA 기본 시트의 `dialog:not([open]){display:none}`
// 은 저자 스타일보다 **항상** 약하다(특이도가 아니라 캐스케이드 오리진 문제라 더 구체적인
// 선택자로도 못 이긴다). `m-0`·`max-h-none`·`max-w-none` 은 UA 기본값(`margin:auto`,
// `max-height:calc(100% - 6px - 2em)`)을 걷어내는 몫이다 — 없으면 `h-dvh` 가 잘린다.
//
// ⚠️ 조립하지 않고 완성된 리터럴로 적는다 — Tailwind 스캐너는 소스를 평문으로 읽어 런타임
// 조립을 찾지 못하고, **빌드는 성공한 채 스타일만 사라진다**(shared/ui/README.md 코드 규약).
const POPUP =
  "hidden open:flex fixed top-0 left-0 z-50 m-0 h-dvh max-h-none w-[min(20rem,calc(100vw-3rem))] " +
  "max-w-none flex-col gap-3 border-r border-line bg-surface p-4 backdrop:bg-ink backdrop:opacity-40";

/**
 * 메시지가 하나도 없는 세션은 목록에서 뺀다.
 *
 * `ChatPanel` 은 **첫 메시지를 보내기 직전에** 세션을 만든다(그 파일 `handleSend`). 그 전송이
 * 실패하면 메시지 0개짜리 세션이 서버에 그대로 남고, 백엔드는 첫 메시지가 저장될 때만
 * `title`·`last_message_at` 을 채우므로 그 세션은 둘 다 `null` 인 채로 목록에 온다. 열어 봐야
 * 빈 화면이라 사용자가 볼 이유가 없다 — 서버에서 지울 수단도 없으니 여기서 거른다.
 */
function hasContent(session: ChatSessionSummary): boolean {
  return session.title !== null || session.last_message_at !== null;
}

export interface ChatHistoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 지금 화면에 열려 있는 세션. `null` 이면 아직 아무 대화도 시작하지 않은 상태다. */
  currentSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onNewSession: () => void;
  /**
   * 대화 1건이 실제로 삭제됐다 (2026-08-30).
   *
   * 🚨 **부모가 반드시 처리해야 한다.** 지운 것이 지금 화면에 열려 있는 대화였다면 그 화면은
   * 이미 존재하지 않는 세션을 보고 있는 것이고, 다음 전송이 404 로 죽는다. `ChatPage` 가
   * 그때 세션을 비우고 sessionStorage 미러까지 지운다.
   */
  onDeleted: (sessionId: string) => void;
}

export function ChatHistoryDrawer({
  open,
  onOpenChange,
  currentSessionId,
  onSelect,
  onNewSession,
  onDeleted,
}: ChatHistoryDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [sessions, setSessions] = useState<ChatSessionSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  // 재조회 트리거 — 실패 후 "다시 시도"가 같은 effect를 다시 돌리게 한다. 조회 로직을 effect
  // 밖으로 빼서 두 곳에서 부르면 취소(cancelled) 처리를 두 번 적어야 한다.
  const [attempt, setAttempt] = useState(0);
  // 삭제 확인 중인 행 — **id 하나**로 들고 있는 것이 곧 「한 번에 하나만 펼쳐진다」는 계약이다
  // (행이 각자 들고 있으면 여러 줄이 동시에 되묻는 상태가 될 수 있다).
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // 열 때마다 새로 조회한다 — 방금 보낸 메시지로 갱신된 제목·시각이 항상 반영된다. 캐시를 두면
  // 무효화 시점을 손으로 관리해야 하고, 그 순간부터 목록과 실제가 조용히 갈린다.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSessions(null);
    setFailed(false);
    // 열 때마다 삭제 확인 상태도 함께 초기화한다 — 닫으면서 되묻는 화면을 두고 나갔다면 다시
    // 열었을 때 그 상태가 되살아나면 안 된다.
    setPendingDeleteId(null);
    setDeletingId(null);
    setDeleteError(null);
    listChatSessions()
      .then((res) => {
        if (!cancelled) setSessions(res.sessions.filter(hasContent));
      })
      .catch(() => {
        // 조용히 삼키지 않는다 — 목록이 비어 보이는 것과 못 불러온 것은 사용자에게 전혀 다른
        // 사실이다(이 저장소 관례).
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, attempt]);

  function close() {
    onOpenChange(false);
  }

  function askDelete(sessionId: string) {
    setPendingDeleteId(sessionId);
    setDeleteError(null);
  }

  function cancelDelete() {
    setPendingDeleteId(null);
    setDeleteError(null);
  }

  async function confirmDelete(sessionId: string) {
    setDeletingId(sessionId);
    setDeleteError(null);
    try {
      await deleteChatSession(sessionId);
      removeSession(sessionId);
    } catch (err) {
      // 이미 서버에서 사라진 대화를 지우려 한 것뿐이라면 사용자가 원한 결과는 이미 이뤄져 있다 —
      // 에러를 보여 봐야 「지워졌는데 실패했다고 한다」가 된다. 목록에서 빼는 것으로 끝낸다.
      // ⚠️ 이 분기는 **백엔드가 낸 봉투 코드**로만 걸린다. 엔드포인트 자체가 없을 때의 404 는
      // `{"detail":"Not Found"}` 라 봉투가 없어 `UNKNOWN_ERROR` 로 떨어지고 아래로 간다 —
      // 미배포 상태를 「삭제 성공」으로 오인하지 않는다.
      if (err instanceof ApiError && err.code === "CHAT_SESSION_NOT_FOUND") {
        removeSession(sessionId);
        return;
      }
      // 조용히 삼키지 않는다(이 저장소 관례) — 행은 되묻는 상태 그대로 두고 사유만 덧붙인다.
      setDeleteError(err instanceof ApiError ? err.message : "대화를 삭제하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setDeletingId(null);
    }
  }

  // 목록을 다시 조회하지 않고 **낙관적으로 제거**한다 — 드로어가 열린 채라 재조회는 목록 전체를
  // 스켈레톤으로 되돌려 깜빡인다. 불변 갱신이므로 원본 배열을 건드리지 않는다.
  function removeSession(sessionId: string) {
    setSessions((cur) => cur?.filter((s) => s.id !== sessionId) ?? null);
    setPendingDeleteId(null);
    setDeleteError(null);
    // 드로어는 **닫지 않는다** — 연속 삭제가 자연스럽다(`onSelect`/`onNewSession` 이 닫는 것과
    // 다른 점이다: 그 둘은 대화 화면으로 돌아가는 행동이고, 삭제는 목록 안에서 끝나는 행동이다).
    onDeleted(sessionId);
  }

  // 바깥(가림막) 클릭으로 닫는다 — 파괴적 행동이 아니라 훑어보는 목록이라 쉽게 빠져나갈 수
  // 있어야 한다(`ConfirmDialog` 가 반대 선택을 한 이유와 정확히 대칭이다). 가림막은 다이얼로그
  // 자신의 박스라 클릭 타깃이 `<dialog>` 그 자체로 온다 — 안쪽 요소가 타깃이면 무시한다.
  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current) close();
  }

  return (
    // 두 a11y 규칙을 이 요소에 한해 끈다 — **끄는 것 말고 통과할 길이 없다.** 규칙이 요구하는
    // 해법은 "적절한 interactive role 을 명시하라"인데, `<dialog>` 의 암묵 role 이 이미
    // `dialog` 라 명시하는 순간 `no-redundant-roles` 에 걸린다(둘 다 켜져 있어 서로를 막는다).
    // 규칙들이 실제로 막으려는 위험(키보드로 도달할 수 없는 유일한 조작 수단)은 여기 없다 —
    // 이 핸들러가 맡는 것은 **가림막 클릭**이라는 순수한 추가 편의이고, 같은 일(닫기)을 하는
    // 44px 「닫기」 버튼이 패널 안에 있으며 Esc 는 UA 가 `cancel` 로 준다(아래 onCancel).
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events
    <dialog
      ref={dialogRef}
      aria-labelledby="chat-history-title"
      className={POPUP}
      onClick={handleBackdropClick}
      // Esc 는 UA 가 처리해 다이얼로그를 직접 닫는다 — 그 사실을 React state 에 되돌려주지
      // 않으면 부모는 여전히 열려 있다고 믿는다. `cancel` 이 그 동기화 지점이다.
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="chat-history-title" className="text-lg font-bold text-ink">
          지난 대화
        </h2>
        <Button variant="secondary" onClick={close}>
          닫기
        </Button>
      </div>

      {/* `min-h-0` 이 없으면 flex 아이템이 콘텐츠의 내재 크기 밑으로 못 줄어들어(flex 기본 규칙)
          목록이 길 때 이 영역이 늘어나며 아래 버튼을 화면 밖으로 밀어낸다. */}
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {sessions === null && !failed && <SkeletonRows count={5} />}

        {failed && (
          <div className="flex flex-col items-start gap-2">
            <p role="alert" className="text-sm text-primary">
              대화 목록을 불러오지 못했습니다.
            </p>
            <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
              다시 시도
            </Button>
          </div>
        )}

        {sessions !== null && sessions.length === 0 && (
          <p className="text-sm text-ink-soft">아직 나눈 대화가 없어요.</p>
        )}

        {sessions?.map((session) => (
          <ChatHistoryRow
            key={session.id}
            session={session}
            isCurrent={session.id === currentSessionId}
            confirming={pendingDeleteId === session.id}
            deleting={deletingId === session.id}
            error={pendingDeleteId === session.id ? deleteError : null}
            onSelect={onSelect}
            onAskDelete={askDelete}
            onCancelDelete={cancelDelete}
            onConfirmDelete={(id) => void confirmDelete(id)}
          />
        ))}
      </div>

      <Button block onClick={onNewSession}>
        새 대화 시작하기
      </Button>
    </dialog>
  );
}
