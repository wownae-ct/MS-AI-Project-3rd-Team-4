// AI상담 채팅 UI — HANDOFF.md §4 S3: 답변엔 항상 출처 배지 또는 "근거 없음" 표시, SSE 스트리밍.
//
// entities/chat 소속이다(원래 pages/category/ui/ 에 있었으나 2026-08-24, 하단 탭 "AI상담"(/chat,
// docs/wedding/plan/new/12_final_prototype_mockup.html — S3 안에서만 쓰던 목업 세트엔 없던,
// 최종 프로토타입에만 있는 5번째 탭)이 생기면서 두 화면(pages/category, pages/chat)이 같은 채팅
// UI를 써야 했다. `.oxlintrc.json`의 pages override(그룹 `@/pages/*/**`)가 페이지 간 내부 파일
// 직접 참조를 막아 pages/chat 이 pages/category 내부를 가져올 수 없다 — entities 는 여러 페이지가
// 공유하는 슬라이스이므로(layers.md) 여기로 옮기는 게 맞는 위치다. FSD 공식 세그먼트 5종에 `ui`가
// 포함되므로 entities 에 `ui` 세그먼트를 두는 것 자체는 규범 위반이 아니다.
//
// 세션은 첫 메시지 전송 시점에만 생성한다(탭을 열자마자 만들지 않음 — 체크리스트/비용 탭만 보고
// 나가는 방문마다 세션이 쌓이는 것을 막는다). 세션 id는 호출자(CategoryPage/ChatPage)가 들고
// 있다가 이 컴포넌트에 내려준다 — Base UI Tabs.Panel이 비활성 탭을 언마운트할 수 있어(keepMounted
// 기본값 미확인), 이 컴포넌트 로컬 state에만 두면 탭을 나갔다 돌아올 때 세션을 잃을 수 있다.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError } from "@/shared/api";
import { Card } from "@/shared/ui";
import { createChatSession, getChatMessages, rateChatMessage, sendChatMessage } from "../api/chat";
import type { ChatCitation, ChatMessage, ChatStage, ChatVerification, MessageRating } from "../model";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";

// stage 이벤트(2026-08-24 백엔드 세션 추가) 라벨 — 챗 그래프 3노드(retrieve→generate→verify)
// 이름과 1:1. 사용자 요청 "진행상황이 보이게해야지"에 대응하는 실제 표시 문구.
const STAGE_LABELS: Record<ChatStage, string> = {
  retrieve: "근거를 찾고 있어요",
  generate: "답변을 작성하고 있어요",
  verify: "답변을 검증하고 있어요",
};

interface ChatPanelProps {
  /**
   * `CategoryPage`(S3)는 고정 문자열을 준다 — 사용자가 이미 카테고리를 골라 들어왔으므로.
   * `ChatPage`(하단 탭 "AI상담")는 아예 생략한다 — 카테고리 무관 전역 상담이다
   * (backend PR #50, 2026-08-24 머지: `POST /chat/sessions`의 category_code가 optional로
   * 열렸고 RAG 검색도 필터 없이 전체 대상으로 동작한다). 예전엔 백엔드가 이걸 지원 못 해서
   * 첫 메시지 내용을 클라이언트에서 키워드로 훑어 카테고리를 추측하는 임시방편
   * (`pages/chat/lib/classify-category.ts`)을 썼는데, 백엔드가 열리면서 그 파일과 이 prop의
   * 함수 형태는 전부 걷어냈다 — 더 이상 "언제 어떤 카테고리를 쓸지 추측"할 필요가 없다.
   */
  categoryCode?: string;
  sessionId: string | null;
  onSessionCreated: (id: string) => void;
  /** entities 레이어 교차import 제약 때문에 pages(CategoryPage/ChatPage)가 내려주는 신고(F13)
      버튼 렌더러 — 자세한 이유는 MessageBubble.tsx 머리말 참고. */
  renderReportAction?: (messageId: string) => ReactNode;
}

// 스트리밍 중인 답변을 완결된 ChatMessage 처럼 다루기 위한 임시 형태 — id 는 아직 서버가
// 발급하지 않았으므로(done 이벤트에서야 message_id 가 온다) 프론트에서만 쓰는 자리표시자.
interface DraftAssistantMessage {
  content: string;
  citations?: ChatCitation[];
  verification?: ChatVerification;
}

export function ChatPanel({ categoryCode, sessionId, onSessionCreated, renderReportAction }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState<DraftAssistantMessage | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<ChatStage | null>(null);
  // CRAG 재시도 루프(verify가 WEAK/GENERAL이면 최대 1회 retrieve→generate→verify를 다시 돎,
  // 2026-08-24 백엔드 세션 인계) 진행 중 여부 — stage가 아직 없거나(현재 배포본) null로 리셋된
  // 직후(2차 시도의 첫 stage 이벤트가 오기 전) TypingIndicator 라벨을 "다시 찾는 중"으로 보여주는
  // 용도일 뿐, retry 자체의 처리(토큰 버리기)는 draft/draftRef 리셋만으로 끝난다.
  const [retrying, setRetrying] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  // sending state는 리렌더를 거쳐야 반영된다 — IME 조합 확정 시 Enter 키다운이 두 번 잡히는
  // 경우처럼 handleSend가 짧은 틈 안에 두 번 호출되면 둘 다 sending===false를 보고 통과해
  // SSE 스트림이 두 번 열린다(다른 세션이 실사용자 리포트로 재현·확인, 2026-08-24). 동기적으로
  // 즉시 막아야 하므로 ref 락을 별도로 둔다.
  const sendingRef = useRef(false);
  // onDone에서 draft(스트리밍 누적분)를 부수효과 없이 읽기 위한 동기 미러 — onToken/onCitations/
  // onVerification이 setDraft(updater)로 draft를 갱신할 때마다 같이 갱신한다. draft state를
  // onDone 클로저에서 직접 읽으면 handleSend 호출 시점(스트림 시작 전 "{content:''}")의 값에
  // 고정돼 스트리밍 중 쌓인 내용을 못 본다 — 그래서 원래 setDraft((cur)=>{setMessages(...); ...})
  // 처럼 setState updater 안에서 최신 draft를 읽었는데, updater 안의 setMessages 호출 자체가
  // StrictMode(app/main.tsx)의 "updater 순수성 검증을 위한 2회 호출"에 걸려 메시지가 두 번
  // append되는 버그였다(사용자 리포트 2026-08-24, 재현: Enter/버튼 무관하게 매번). ref 미러는
  // 대입만 하므로 두 번 호출돼도 같은 값이 다시 대입될 뿐 부수효과가 없다.
  const draftRef = useRef<DraftAssistantMessage | null>(null);
  // handleSend가 첫 메시지 전송 중 세션을 새로 만들면 onSessionCreated가 부모의 sessionId를
  // 바꾸고, 그게 이 컴포넌트로 새 prop이 되어 내려오면서 아래 useEffect가 재실행된다. 그 시점엔
  // 아직 sendChatMessage가 진행 중이라(백엔드가 user 메시지를 막 저장했거나 안 했거나 하는
  // 경합 구간) getChatMessages가 빈 배열을 돌려줄 수 있고, 그걸로 setMessages를 덮어쓰면 방금
  // 낙관적으로 넣은 사용자 질문 말풍선이 통째로 사라진다(사용자 리포트 2026-08-26 "유저의
  // 질문이 사라져"). 이 플래그는 "방금 이 컴포넌트가 만든 세션이라 로컬 상태가 이미 정답"임을
  // 표시해 그 1회의 히스토리 재조회만 건너뛴다 — 기존에 이미 있던 세션으로 진입할 때의 정상
  // 히스토리 복원(effect 최초 실행)은 그대로 동작한다.
  const skipNextHistoryFetchRef = useRef(false);
  // 진행 중인 sendChatMessage SSE 스트림을 컴포넌트 언마운트 시 끊기 위한 컨트롤러 — 이전엔
  // abort 수단이 전혀 없어, 하단 탭 이동으로 언마운트돼도 스트림이 조용히 계속 실행됐다
  // (레드팀 감사 HIGH). 요청마다 새로 만들어 교체한다.
  const abortControllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);
  // 평가(👍/👎) 연타 가드 — 메시지별 "가장 최근 요청" 일련번호. 응답이 보낸 순서와 다르게
  // 도착해도, 이 메시지에 대해 자신이 아직 최신 요청일 때만 실패 롤백을 적용한다(레드팀 감사:
  // 안 그러면 나중에 보낸 성공 결과를 먼저 보낸 요청의 실패 롤백이 덮어쓸 수 있다).
  const ratingSeqRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!sessionId) return;
    if (skipNextHistoryFetchRef.current) {
      skipNextHistoryFetchRef.current = false;
      return;
    }
    let cancelled = false;
    getChatMessages(sessionId)
      .then((res) => {
        if (!cancelled) setMessages(res.messages);
      })
      .catch(() => {
        // 히스토리 복원 실패는 새 대화를 막지 않는다 — 조용히 빈 목록으로 둔다.
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, draft]);

  async function handleSend() {
    const content = input.trim();
    if (!content || sendingRef.current) return;
    sendingRef.current = true;

    const localMessageId = `local-${Date.now()}`;
    function markLocalMessageFailed() {
      setMessages((msgs) => msgs.map((m) => (m.id === localMessageId ? { ...m, failed: true } : m)));
    }

    setError(null);
    setInput("");
    setMessages((cur) => [
      ...cur,
      { id: localMessageId, role: "user", content, created_at: new Date(0).toISOString() },
    ]);
    setSending(true);
    setStage(null);
    setRetrying(false);
    const initialDraft = { content: "" };
    setDraft(initialDraft);
    draftRef.current = initialDraft;

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      let activeSessionId = sessionId;
      if (!activeSessionId) {
        const session = await createChatSession(categoryCode);
        activeSessionId = session.id;
        skipNextHistoryFetchRef.current = true;
        onSessionCreated(session.id);
      }

      await sendChatMessage(
        activeSessionId,
        content,
        {
          onToken: (delta) => {
            setDraft((cur) => {
              const next = cur ? { ...cur, content: cur.content + delta } : { content: delta };
              draftRef.current = next;
              return next;
            });
          },
          onCitations: (citations) => {
            setDraft((cur) => {
              const next = cur ? { ...cur, citations } : { content: "", citations };
              draftRef.current = next;
              return next;
            });
          },
          onVerification: (verification) => {
            setDraft((cur) => {
              const next = cur ? { ...cur, verification } : { content: "", verification };
              draftRef.current = next;
              return next;
            });
          },
          onStage: (nextStage) => {
            setStage(nextStage);
          },
          onRetry: () => {
            // 1차 답변 토큰은 전부 버린다 — 2차 답변이 처음부터 다시 스트리밍된다. citations/
            // verification은 항상 마지막 시도 결과 하나만 오므로 여기서 따로 지울 게 없다.
            const freshDraft = { content: "" };
            setDraft(freshDraft);
            draftRef.current = freshDraft;
            setStage(null);
            setRetrying(true);
          },
          onDone: (payload) => {
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
            setDraft(null);
            draftRef.current = null;
            setStage(null);
            setRetrying(false);
            sendingRef.current = false;
            setSending(false);
          },
          onError: (payload) => {
            setError(payload.message);
            markLocalMessageFailed();
            setDraft(null);
            draftRef.current = null;
            setStage(null);
            setRetrying(false);
            sendingRef.current = false;
            setSending(false);
          },
        },
        abortController.signal,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "메시지를 보내지 못했습니다.");
      markLocalMessageFailed();
      setDraft(null);
      draftRef.current = null;
      setStage(null);
      setRetrying(false);
      sendingRef.current = false;
      setSending(false);
    }
  }

  // AI 답변에만 호출된다(greeting/draft는 MessageBubble에 onRate를 안 넘겨서 애초에 버튼이 안
  // 뜬다) — 이 시점엔 sessionId가 이미 실제 값이다(메시지가 존재한다는 건 세션도 있다는 뜻).
  // 낙관적 갱신 후 실패하면 되돌리고 에러를 보여준다(이 프로젝트 컨벤션 — 조용히 삼키지 않는다).
  async function handleRate(messageId: string, rating: MessageRating) {
    if (!sessionId) return;
    const seq = (ratingSeqRef.current.get(messageId) ?? 0) + 1;
    ratingSeqRef.current.set(messageId, seq);
    const previous = messages.find((m) => m.id === messageId)?.user_rating ?? null;
    setMessages((msgs) => msgs.map((m) => (m.id === messageId ? { ...m, user_rating: rating } : m)));
    try {
      await rateChatMessage(sessionId, messageId, rating);
    } catch (err) {
      // 이 요청이 이 메시지에 대한 "가장 최근" 평가 시도일 때만 되돌린다 — 그 사이 사용자가
      // 이미 다른 평가를 다시 눌렀다면(더 최신 요청이 존재) 그 결과를 덮어쓰면 안 된다
      // (레드팀 감사: 먼저 보낸 요청의 실패 롤백이 나중에 보낸 요청의 성공 상태를 덮어쓰던 경합).
      if (ratingSeqRef.current.get(messageId) === seq) {
        setMessages((msgs) => msgs.map((m) => (m.id === messageId ? { ...m, user_rating: previous } : m)));
      }
      setError(err instanceof ApiError ? err.message : "평가를 저장하지 못했습니다.");
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      {/* role="log" + aria-live="polite" — 스트리밍 토큰/출처 배지/검증 결과가 이 컨테이너에
          조용히 추가되기만 해서, 이전엔 스크린리더가 답변이 도착한다는 사실 자체를 몰랐다
          (레드팀 감사). aria-relevant="additions text" 로 텍스트 갱신까지 announce 한다 — 매
          토큰마다 announce 되면 너무 시끄러우니 스트리밍 도중이 아니라 완결 단위(문단)로 뜨는
          기본 동작에 맡긴다. */}
      {/* 채팅 칸을 더 크게, 반응형으로(사용자 요청, 2026-08-26) — `vh`가 아니라 `dvh`를 쓴다
          (router.tsx의 min-h-dvh와 같은 이유: 모바일 브라우저 주소창이 접히고 펴질 때 vh는
          안 따라온다). 모바일 상한을 62dvh로 눌러둔 이유 — AppShell이 모바일에서 fixed 하단
          탭바 + pb-24를 쓰는데, 그 위에 Page 헤더 + 입력 행 + Card 패딩까지 겹치면 70dvh 이상은
          페이지 자체가 세로 스크롤돼 스크롤 영역이 이중이 된다. */}
      <div
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        className="flex min-h-[45dvh] max-h-[62dvh] md:min-h-[55dvh] md:max-h-[70dvh] lg:min-h-[60dvh] lg:max-h-[72dvh] flex-col gap-3 overflow-y-auto"
      >
        {messages.length === 0 && !draft && (
          // 첫 진입 안내를 회색 텍스트가 아니라 어시스턴트 말풍선으로 보여준다(사용자 요청,
          // 2026-08-24) — 실제 대화 내역이 아니라 화면에서만 합성한 안내라 id="greeting"으로
          // 구분하고 서버에 저장되지 않는다. MessageBubble을 그대로 재사용해 실제 답변 말풍선과
          // 시각적으로 같은 규범(모양/여백/타이포)을 따르게 한다.
          <MessageBubble
            message={{
              id: "greeting",
              role: "assistant",
              content: categoryCode === undefined ? "무엇이 궁금하세요?" : "이 카테고리에 대해 무엇이 궁금하세요?",
              created_at: new Date(0).toISOString(),
            }}
          />
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} onRate={handleRate} renderReportAction={renderReportAction} />
        ))}
        {draft &&
          (draft.content === "" ? (
            // 첫 토큰이 오기 전 구간 — "스트리밍 중"과 "아직 시작 안 함"을 구분해서 보여준다
            // (사용자 요청: "진행상황이 보이게"). 토큰이 하나라도 오면 아래 MessageBubble로
            // 전환되므로 이 상태는 항상 일시적이다. stage가 있으면 그걸 최우선으로 보여주고
            // (retry 이후 2차 시도의 stage 이벤트가 오면 자연히 여기로 갱신된다), stage가 아직
            // 없는데 retry 직후라면 "다시 찾는 중" 문구로, 둘 다 아니면 기존 폴백 문구로 보여준다.
            <TypingIndicator
              label={stage ? STAGE_LABELS[stage] : retrying ? "더 정확한 답변을 다시 찾고 있어요" : "답변을 준비하고 있어요"}
            />
          ) : (
            <div className="flex flex-col gap-1 items-start">
              <MessageBubble
                message={{
                  id: "draft",
                  role: "assistant",
                  content: draft.content,
                  citations: draft.citations,
                  verification: draft.verification,
                  created_at: new Date(0).toISOString(),
                }}
              />
              {/* 토큰은 이미 나오는데 verify 노드가 아직 안 끝난 구간 — 답변 문장은 다
                  왔지만 근거 검증 중이라 verification 배지가 아직 안 붙는다는 걸 알려준다. */}
              {stage === "verify" && !draft.verification && (
                <p className="text-xs text-ink-soft">{STAGE_LABELS.verify}</p>
              )}
            </div>
          ))}
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-line bg-primary-soft px-3 py-2 text-sm text-primary">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) void handleSend();
          }}
          placeholder="메시지를 입력하세요"
          disabled={sending}
          className="min-h-tap flex-1 rounded-md border border-line bg-surface px-3 text-sm text-ink disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={sending || !input.trim()}
          className="min-h-tap rounded-md border border-transparent bg-primary px-4 text-sm font-bold text-surface enabled:hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          보내기
        </button>
      </div>
    </Card>
  );
}
