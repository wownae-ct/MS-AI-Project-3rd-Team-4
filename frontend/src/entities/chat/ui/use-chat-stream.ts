// AI상담 한 번의 전송 = 하나의 SSE 스트림 — 그 상태 기계. `ChatPanel.tsx` 에서 분리했다
// (2026-08-31, eslint max-lines 300줄 제한). `MessageBubble.tsx` · `TypingIndicator.tsx` ·
// `StreamingDraft.tsx` · `use-sticky-scroll.ts` 가 같은 사유로 먼저 갈라져 나간 선례를 따른다.
// `messages` 와 세션 전환 effect 는 **일부러 두고 왔다** — `useStickyScroll(messages, draft)` 이
// 이 훅의 `draft` 를 인자로 받으므로, 그쪽까지 가져오면 두 훅이 서로를 필요로 하는 순환이 된다.
//
// ─────────────────────────────────────────────────────────────────────────────
// 🚨 **이 파일의 규약 — 동기 진실은 ref 에 두고 `setState` 는 그 미러다.**
//
// 종전에는 반대였다. `draftRef` 를 `setDraft(updater)` **안에서** 갱신했는데, React 는 updater 를
// 부르는 시점을 스스로 정한다 — 한 배치의 **첫** 업데이트만 미리 계산하고(빈 큐 bail-out 최적화)
// 두 번째부터는 **렌더가 돌 때까지 미룬다.** 즉 그 미러는 「React 가 flush 한 뒤」에만 정확했다.
//
// 그런데 백엔드는 스트림 꼬리 3종을 **await 하나 없이 연달아** 흘린다
// (backend/app/services/chat.py): `citations` → `verification` → (DB 커밋) → `done`.
// 앞 둘은 사실상 같은 청크로 도착하고, `api/chat.ts` 는 한 청크의 모든 프레임을 **동기 for
// 루프**로 디스패치한다 → 한 배치 → `verification` 을 반영한 updater 가 실행되기 전에 `onDone`
// 이 미러를 읽는다. 그렇게 만들어진 완결 메시지엔 `verification` 이 없고, `MessageBubble` 은
// 근거 블록 전체를 그 필드 하나로 게이트하므로 **검증 배지·출처 목록·평가/신고 버튼이 통째로
// 안 그려졌다.** 다른 화면에 갔다 오면 `getChatMessages` 재조회가 서버 값으로 되살려서, 사용자
// 눈에는 「재생성한 답변만 근거가 늦게 나온다」로 보였다(사용자 리포트 2026-08-30).
// 재검색이 걸리면 LLM 왕복이 6회로 늘어 꼬리가 한 청크에 뭉칠 확률이 특히 높아진다.
//
// 그래서 이제 `applyDraft` **하나만** draft 를 바꾼다 — ref 를 먼저 대입하고 state 는 값으로
// 넘긴다. 이벤트 도착 순서대로 동기 갱신되므로 React 의 flush 타이밍과 무관해진다.
// ⚠️ updater 에 부수효과를 넣지 않는다는 규약도 함께 지킨다 — StrictMode 가 updater 를 순수성
// 검증용으로 두 번 부르는 탓에 메시지가 두 번 append 되던 버그가 이미 한 번 있었다(2026-08-24).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ApiError } from "@/shared/api";
import { createChatSession, getChatMessages, sendChatMessage } from "../api/chat";
import type { ChatMessage, ChatStage } from "../model";
import type { DraftAssistantMessage } from "./StreamingDraft";

// `done` 도 `error` 도 못 받고 스트림이 닫혔을 때의 문구. 「전송 실패」가 아니다 — user 메시지는
// 스트림이 시작되기 전에 커밋되므로 전송 자체는 성공했고, 못 받은 것은 답변이다.
const NO_ANSWER_MESSAGE = "답변을 받지 못했습니다. 잠시 후 다시 시도해 주세요.";

export interface ChatStreamArgs {
  sessionId: string | null;
  categoryCode?: string;
  onSessionCreated: (id: string) => void;
  /** 낙관적 user 말풍선·완결 답변·서버 화해 결과를 얹을 자리. `ChatPanel` 이 목록을 들고 있다. */
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
}

export interface ChatStream {
  draft: DraftAssistantMessage | null;
  stage: ChatStage | null;
  retrying: boolean;
  sending: boolean;
  error: string | null;
  /** 평가 실패처럼 스트림 밖에서 난 사유도 같은 배너를 쓴다. */
  setError: (message: string | null) => void;
  send: (content: string) => Promise<void>;
  /** 🚨 `useCallback([])` — 호출부(세션 전환 effect)의 의존성에 들어간다. */
  resetForSession: () => void;
  /** 🚨 `useCallback([])` — 읽으면서 내린다. true 면 이번 세션 변경은 히스토리 재조회를 건너뛴다. */
  consumeSkipHistoryFetch: () => boolean;
}

export function useChatStream({ sessionId, categoryCode, onSessionCreated, setMessages }: ChatStreamArgs): ChatStream {
  const [draft, setDraft] = useState<DraftAssistantMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<ChatStage | null>(null);
  // CRAG 재시도 루프(verify가 WEAK/GENERAL이면 최대 1회 retrieve→generate→verify를 다시 돎)
  // 진행 중 여부 — 화면에 남아 있는 답변이 아직 1차 결과라는 뜻이라 StreamingDraft가 "다시 찾는
  // 중" 안내를 붙이는 근거가 된다. 2차 첫 토큰이 도착하면 내린다.
  const [retrying, setRetrying] = useState(false);

  // sending state는 리렌더를 거쳐야 반영된다 — IME 조합 확정 시 Enter 키다운이 두 번 잡히는
  // 경우처럼 send가 짧은 틈 안에 두 번 호출되면 둘 다 sending===false를 보고 통과해 SSE 스트림이
  // 두 번 열린다(다른 세션이 실사용자 리포트로 재현·확인, 2026-08-24). 동기적으로 즉시 막아야
  // 하므로 ref 락을 별도로 둔다.
  const sendingRef = useRef(false);
  // 파일 머리말의 「동기 진실」 — `applyDraft` 만이 이 둘을 함께 움직인다.
  const draftRef = useRef<DraftAssistantMessage | null>(null);
  // send가 첫 메시지 전송 중 세션을 새로 만들면 onSessionCreated가 부모의 sessionId를 바꾸고,
  // 그게 ChatPanel의 세션 effect를 재실행시킨다. 그 시점엔 아직 sendChatMessage가 진행 중이라
  // (백엔드가 user 메시지를 막 저장했거나 안 했거나 하는 경합 구간) getChatMessages가 빈 배열을
  // 돌려줄 수 있고, 그걸로 목록을 덮으면 방금 낙관적으로 넣은 사용자 질문이 통째로 사라진다
  // (사용자 리포트 2026-08-26 "유저의 질문이 사라져"). 이 플래그는 그 1회만 건너뛰게 한다.
  const skipNextHistoryFetchRef = useRef(false);
  // CRAG 재시도가 예고된 상태 — 다음 토큰은 2차 답변의 첫 글자이므로 누적이 아니라 **교체**다.
  // 예전엔 retry 이벤트를 받는 즉시 draft를 비웠는데, 그러면 2차 첫 토큰이 오기까지의 공백 동안
  // 사용자가 읽던 1차 답변이 통째로 사라졌다(레드팀 감사 #16). 버리는 시점만 뒤로 미룬다.
  const replaceOnNextTokenRef = useRef(false);
  // 진행 중인 sendChatMessage SSE 스트림을 언마운트·세션 전환 시 끊기 위한 컨트롤러 — 이전엔
  // abort 수단이 전혀 없어, 하단 탭 이동으로 언마운트돼도 스트림이 조용히 계속 실행됐다
  // (레드팀 감사 HIGH). 요청마다 새로 만들어 교체한다.
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const applyDraft = useCallback((next: DraftAssistantMessage | null) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  // 스트림이 어떤 이유로든 끝났다 — 진행 표시를 내리고 입력창을 연다. 이 함수를 거치지 않는
  // 종료 경로를 만들지 않는 것이 「입력창 영구 잠김」을 막는 유일한 계약이다.
  const finishStream = useCallback(() => {
    applyDraft(null);
    setStage(null);
    setRetrying(false);
    replaceOnNextTokenRef.current = false;
    sendingRef.current = false;
    setSending(false);
  }, [applyDraft]);

  const resetForSession = useCallback(() => {
    abortControllerRef.current?.abort();
    // ⚠️ abort 되면 `sendChatMessage`는 **조용히 return** 한다(그 함수의 catch가 그렇게 설계돼
    // 있다 — 언마운트용 계약). 그래서 send의 상위 catch도, onError/onDone도 돌지 않는다.
    // 여기서 직접 풀어 주지 않으면 입력창이 영구히 잠긴 채로 남는다.
    finishStream();
    setError(null);
  }, [finishStream]);

  const consumeSkipHistoryFetch = useCallback(() => {
    if (!skipNextHistoryFetchRef.current) return false;
    skipNextHistoryFetchRef.current = false;
    return true;
  }, []);

  /**
   * 서버에 저장된 답변과 화면을 맞춘다 — 스트림이 그것을 못 전해 준 두 경우에 쓴다.
   *
   * ① `done`·`error` 없이 스트림이 닫힘. 백엔드는 **DB 커밋 뒤에** `done` 을 보내므로
   *    (docs/architecture/chat-streaming.md §5), 종료 이벤트가 없어도 답변은 이미 저장돼 있을 수
   *    있다. 배포 환경 인그레스의 읽기 타임아웃 60초가 실제로 이 상황을 만든다.
   * ② `event: error` 인데 답변은 저장된 경우. `_finish_after_upstream_failure` 가 답변을 커밋한
   *    뒤 `citations`→`verification`→`error` 를 보낸다.
   *
   * 🚨 **목록을 통째로 덮지 않는다.** 서버 응답으로 갈아치우면 로컬에만 있는 낙관적 말풍선과
   * 이전 전송의 `failed` 표시가 함께 사라진다. 빠진 답변 **한 건만** 덧붙인다.
   * ⚠️ updater 는 순수하게 유지한다(파일 머리말) — 판정은 서버 응답만 보고 바깥에서 한다.
   *
   * 🚨 조회가 도는 동안 사용자가 대화를 갈아탔을 수 있다 — 그때 붙이면 **다른 대화의 답변이 남의
   * 화면에 뜬다.** 그 스트림의 signal 로 판정한다(세션 전환 effect 가 abort 한다).
   *
   * @returns 서버에 이 턴의 답변이 있었는가.
   */
  async function reconcileAnswer(id: string, signal: AbortSignal): Promise<boolean> {
    try {
      const res = await getChatMessages(id);
      if (signal.aborted) return false;
      const last = res.messages.at(-1);
      if (last === undefined || last.role !== "assistant") return false;
      setMessages((msgs) => (msgs.some((m) => m.id === last.id) ? msgs : [...msgs, last]));
      return true;
    } catch {
      // 화해 실패는 대화를 막지 않는다 — 호출부가 「답변을 받지 못했습니다」로 알린다.
      return false;
    }
  }

  async function send(content: string) {
    if (sendingRef.current) return;
    sendingRef.current = true;

    const localMessageId = `local-${Date.now()}`;
    function markLocalMessageFailed() {
      setMessages((msgs) => msgs.map((m) => (m.id === localMessageId ? { ...m, failed: true } : m)));
    }

    setError(null);
    setMessages((cur) => [
      ...cur,
      { id: localMessageId, role: "user", content, created_at: new Date(0).toISOString() },
    ]);
    setSending(true);
    setStage(null);
    setRetrying(false);
    replaceOnNextTokenRef.current = false;
    applyDraft({ content: "" });

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // `done`·`error` 중 무엇이든 받았는가. 둘 다 못 받고 스트림이 끝나는 경우를 아래에서
    // 구분해 내기 위한 신호다 — 이게 없으면 그 경로가 조용히 아무 것도 하지 않는다.
    // ⚠️ 원시값 `let` 이 아니라 객체에 담는다 — 콜백 안에서만 대입되는 지역 변수는 TypeScript
    // 제어흐름 분석이 계속 `null` 로 좁혀 두어 아래 비교가 「의미 없는 비교」로 잡힌다.
    const stream: { terminal: "done" | "error" | null } = { terminal: null };

    try {
      let activeSessionId = sessionId;
      if (activeSessionId === null) {
        const session = await createChatSession(categoryCode);
        // 🚨 세션을 만드는 동안 사용자가 「지난 대화」에서 다른 대화를 열었거나 화면을 떠났을 수
        // 있다. 그대로 onSessionCreated 를 부르면 **사용자가 고르지 않은 세션으로 화면을
        // 되돌리고**, skipNextHistoryFetch 까지 세워 그 대화의 히스토리 복원마저 건너뛴다.
        // 여기서 멈추면 메시지 0개짜리 세션이 서버에 남지만, 그건 이미 존재하던 상황이고
        // (model.ts의 ChatSessionSummary 주석) `ChatHistoryDrawer.hasContent()` 가 목록에서 거른다.
        if (abortController.signal.aborted) return;
        activeSessionId = session.id;
        skipNextHistoryFetchRef.current = true;
        onSessionCreated(session.id);
      }
      // 아래 핸들러 클로저에서 좁혀진 타입을 유지하기 위한 지역 상수.
      const streamSessionId: string = activeSessionId;

      await sendChatMessage(
        streamSessionId,
        content,
        {
          onToken: (delta) => {
            // ⚠️ ref 읽기·비우기는 반드시 setState 바깥에서 한다(파일 머리말의 StrictMode 사정).
            const replacing = replaceOnNextTokenRef.current;
            if (replacing) {
              replaceOnNextTokenRef.current = false;
              setRetrying(false); // 2차 답변이 실제로 오기 시작했다 — "다시 찾는 중" 안내를 내린다.
            }
            const cur = draftRef.current;
            applyDraft({ ...cur, content: (replacing ? "" : (cur?.content ?? "")) + delta });
          },
          onCitations: (citations) => {
            const cur = draftRef.current;
            applyDraft(cur ? { ...cur, citations } : { content: "", citations });
          },
          onVerification: (verification) => {
            const cur = draftRef.current;
            applyDraft(cur ? { ...cur, verification } : { content: "", verification });
          },
          onStage: (nextStage) => {
            setStage(nextStage);
          },
          onRetry: () => {
            // draft를 **비우지 않는다** — 1차 답변은 2차 첫 토큰이 실제로 도착할 때 교체된다
            // (위 onToken의 replacing 분기). 그때까지 사용자는 읽던 답변을 계속 볼 수 있고,
            // StreamingDraft가 "다시 찾고 있어요" 안내를 그 아래에 붙인다. citations/
            // verification은 항상 마지막 시도 결과 하나만 오므로 여기서 따로 지울 게 없다.
            replaceOnNextTokenRef.current = true;
            setStage(null);
            setRetrying(true);
          },
          onDone: (payload) => {
            stream.terminal = "done";
            // 파일 머리말 — 이 미러는 이제 이벤트 도착 순서대로 동기 갱신되므로, `citations` ·
            // `verification` 이 `done` 과 같은 배치로 도착해도 빠지지 않는다.
            const finalDraft = draftRef.current;
            setMessages((msgs) => [
              ...msgs,
              {
                id: payload.message_id,
                role: "assistant",
                content: finalDraft?.content ?? "",
                citations: finalDraft?.citations,
                verification: finalDraft?.verification,
                created_at: new Date(0).toISOString(),
              },
            ]);
            finishStream();
          },
          onError: (payload) => {
            stream.terminal = "error";
            setError(payload.message);
            // 답변이 이미 스트리밍됐다면 백엔드는 그것을 **DB에 저장한 뒤** error를 보낸다
            // (_finish_after_upstream_failure). 그 경우 말풍선을 「전송 실패」로 찍으면 서버에
            // 남아 있는 답변과 화면이 갈린다 — 사유는 배너가 말하고, 답변은 서버에서 가져온다.
            const hadAnswer = (draftRef.current?.content ?? "") !== "";
            if (hadAnswer) void reconcileAnswer(streamSessionId, abortController.signal);
            else markLocalMessageFailed();
            finishStream();
          },
        },
        abortController.signal,
      );

      // 🚨 여기까지 왔는데 종료 이벤트가 없었다면 스트림이 **말없이 닫힌 것**이다(인그레스 읽기
      // 타임아웃 60초 등 — chat-streaming.md §5). 종전엔 이 자리에 코드가 없어 sending 이 true
      // 로 굳은 채 입력창이 영구히 잠겼고, 서버에 저장된 답변도 화면에 못 올라왔다.
      // abort 는 세션 전환·언마운트가 일부러 끊은 것이라 여기서 손대지 않는다(resetForSession 이
      // 이미 정리했고, 화면은 다른 대화를 보고 있다).
      if (abortController.signal.aborted) return;
      if (stream.terminal === null) {
        const recovered = await reconcileAnswer(streamSessionId, abortController.signal);
        // 조회 중에 대화를 갈아탔다면 그쪽 화면에 남의 사유를 띄우지 않는다(위 화해와 같은 판정).
        if (abortController.signal.aborted) return;
        if (!recovered) setError(NO_ANSWER_MESSAGE);
        finishStream();
      }
    } catch (err) {
      // 전환된 뒤에 도착한 실패 문구를 **새 대화 화면에 띄우지 않는다.**
      if (abortController.signal.aborted) return;
      setError(err instanceof ApiError ? err.message : "메시지를 보내지 못했습니다.");
      markLocalMessageFailed();
      finishStream();
    }
  }

  return { draft, stage, retrying, sending, error, setError, send, resetForSession, consumeSkipHistoryFetch };
}
