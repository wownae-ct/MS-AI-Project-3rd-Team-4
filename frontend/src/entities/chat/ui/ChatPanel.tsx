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
// **[2026-08-27 정정]** 위 문단은 이 파일이 옮겨진 시점의 배경 설명일 뿐, 지금의 실제 사용처를
// 뜻하지 않는다 — 카테고리별 AI상담 탭은 2026-08-26 사용자 지시로 빠졌다(pages/category/ui/
// CategoryPage.tsx 주석). 지금은 `pages/chat/ui/ChatPage.tsx` 하나만 이 컴포넌트를 쓴다. 그래도
// 파일 위치는 entities 그대로 둔다 — 다시 카테고리 탭이 생겨도 옮길 필요가 없고, pages 밑에 두면
// 나중에 재사용이 필요해질 때 같은 `.oxlintrc.json` 제약에 다시 걸린다.
//
// 세션은 첫 메시지 전송 시점에만 생성한다(탭을 열자마자 만들지 않음 — 체크리스트/비용 탭만 보고
// 나가는 방문마다 세션이 쌓이는 것을 막는다). 세션 id는 호출자(CategoryPage/ChatPage)가 들고
// 있다가 이 컴포넌트에 내려준다 — Base UI Tabs.Panel이 비활성 탭을 언마운트할 수 있어(keepMounted
// 기본값 미확인), 이 컴포넌트 로컬 state에만 두면 탭을 나갔다 돌아올 때 세션을 잃을 수 있다.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError } from "@/shared/api";
import { Button, Card } from "@/shared/ui";
import { createChatSession, getChatMessages, rateChatMessage, sendChatMessage } from "../api/chat";
import type { ChatMessage, ChatStage, MessageRating } from "../model";
import { MessageBubble } from "./MessageBubble";
import { StreamingDraft, type DraftAssistantMessage } from "./StreamingDraft";

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

export function ChatPanel({ categoryCode, sessionId, onSessionCreated, renderReportAction }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState<DraftAssistantMessage | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<ChatStage | null>(null);
  // CRAG 재시도 루프(verify가 WEAK/GENERAL이면 최대 1회 retrieve→generate→verify를 다시 돎,
  // 2026-08-24 백엔드 세션 인계) 진행 중 여부 — 화면에 남아 있는 답변이 아직 1차 결과라는 뜻이라
  // StreamingDraft가 "다시 찾는 중" 안내를 붙이는 근거가 된다. 2차 첫 토큰이 도착하면 내린다.
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
  // CRAG 재시도가 예고된 상태 — 다음 토큰은 2차 답변의 첫 글자이므로 누적이 아니라 **교체**다.
  // 예전엔 retry 이벤트를 받는 즉시 draft를 비웠는데, 그러면 2차 첫 토큰이 오기까지의 공백 동안
  // 사용자가 읽던 1차 답변이 통째로 사라졌다(레드팀 감사 #16). 버리는 시점만 뒤로 미룬다.
  const replaceOnNextTokenRef = useRef(false);
  // 진행 중인 sendChatMessage SSE 스트림을 컴포넌트 언마운트 시 끊기 위한 컨트롤러 — 이전엔
  // abort 수단이 전혀 없어, 하단 탭 이동으로 언마운트돼도 스트림이 조용히 계속 실행됐다
  // (레드팀 감사 HIGH). 요청마다 새로 만들어 교체한다.
  const abortControllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);
  // 평가(좋아요/싫어요) 연타 가드 — 메시지별 "가장 최근 요청" 일련번호. 응답이 보낸 순서와 다르게
  // 도착해도, 이 메시지에 대해 자신이 아직 최신 요청일 때만 실패 롤백을 적용한다(레드팀 감사:
  // 안 그러면 나중에 보낸 성공 결과를 먼저 보낸 요청의 실패 롤백이 덮어쓸 수 있다).
  const ratingSeqRef = useRef<Map<string, number>>(new Map());

  // 세션 전환 → 화면 정합성. **이 컴포넌트는 원래 "세션은 한 번 정해지면 안 바뀐다"는 전제로
  // 쓰여 있었다** — 호출자가 하나뿐(ChatPage)이고 그쪽도 sessionStorage에 담긴 세션 하나만
  // 들고 있었기 때문이다. 지난 대화 목록(레드팀 #17, 2026-08-29)이 그 전제를 처음으로 깬다.
  // 아래 리셋이 없으면 목록에서 대화를 갈아탈 때 네 가지가 한꺼번에 어긋난다:
  //   ① A→B 전환 중 B 히스토리가 도착하기 전까지 A 대화가 B의 내용인 척 보이고, 그 조회가
  //      실패하면(아래 catch가 아무것도 안 한다) A 대화가 B 화면에 **영구히** 남는다.
  //   ② A→null("새 대화")은 옛 `if (!sessionId) return`에 걸려 아예 돌지 않았다 — 새 대화를
  //      눌렀는데 옛 대화가 그대로 보인다.
  //   ③ 진행 중이던 SSE 스트림이 안 끊겨 **다른 세션 화면에 토큰이 흘러든다.**
  //   ④ draft·error·stage·retrying·평가 일련번호도 전부 세션에 종속된 상태다.
  useEffect(() => {
    // ⚠️ 이 조기 반환은 반드시 아래 리셋보다 **위**에 있어야 한다. 이 경로는 "방금 이
    // 컴포넌트가 첫 메시지를 보내며 스스로 만든 세션"이라, 낙관적 user 말풍선과 진행 중인
    // 스트림이 그대로 살아 있어야 한다 — 여기서 리셋하면 2026-08-26에 이미 한 번 고쳤던
    // "유저의 질문이 사라져" 버그가 그대로 재발한다.
    if (skipNextHistoryFetchRef.current) {
      skipNextHistoryFetchRef.current = false;
      return;
    }

    abortControllerRef.current?.abort();
    // ⚠️ abort 되면 `sendChatMessage`는 **조용히 return** 한다(그 함수의 catch가 그렇게
    // 설계돼 있다 — 언마운트용 계약). 그래서 handleSend의 상위 catch도, onError/onDone도
    // 돌지 않는다. 여기서 직접 풀어 주지 않으면 입력창이 영구히 잠긴 채로 남는다.
    sendingRef.current = false;
    setSending(false);
    setMessages([]);
    setDraft(null);
    draftRef.current = null;
    setError(null);
    setStage(null);
    setRetrying(false);
    replaceOnNextTokenRef.current = false;
    ratingSeqRef.current.clear();

    if (!sessionId) return; // 새 대화 — 비우기만 하고 조회할 히스토리가 없다.

    let cancelled = false;
    getChatMessages(sessionId)
      .then((res) => {
        if (!cancelled) setMessages(res.messages);
      })
      .catch(() => {
        // 히스토리 복원 실패는 새 대화를 막지 않는다 — 위에서 이미 비웠으므로 빈 목록으로 남는다.
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
    replaceOnNextTokenRef.current = false;
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
            // ⚠️ ref 읽기·비우기는 반드시 updater **바깥**에서 한다. StrictMode(app/main.tsx)는
            // updater를 순수성 검증용으로 두 번 부르는데, 안에서 비우면 두 번째 호출이
            // replacing=false를 봐서 1차 답변이 지워지지 않고 2차가 뒤에 이어붙는다.
            const replacing = replaceOnNextTokenRef.current;
            if (replacing) {
              replaceOnNextTokenRef.current = false;
              setRetrying(false); // 2차 답변이 실제로 오기 시작했다 — "다시 찾는 중" 안내를 내린다.
            }
            setDraft((cur) => {
              const base = replacing ? "" : (cur?.content ?? "");
              const next = { ...cur, content: base + delta };
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
            // draft를 **비우지 않는다** — 1차 답변은 2차 첫 토큰이 실제로 도착할 때 교체된다
            // (위 onToken의 replacing 분기). 그때까지 사용자는 읽던 답변을 계속 볼 수 있고,
            // StreamingDraft가 "다시 찾고 있어요" 안내를 그 아래에 붙인다. citations/
            // verification은 항상 마지막 시도 결과 하나만 오므로 여기서 따로 지울 게 없다.
            replaceOnNextTokenRef.current = true;
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
    <Card className="flex min-h-0 flex-1 flex-col gap-3">
      {/* role="log" + aria-live="polite" — 스트리밍 토큰/출처 배지/검증 결과가 이 컨테이너에
          조용히 추가되기만 해서, 이전엔 스크린리더가 답변이 도착한다는 사실 자체를 몰랐다
          (레드팀 감사). aria-relevant="additions text" 로 텍스트 갱신까지 announce 한다 — 매
          토큰마다 announce 되면 너무 시끄러우니 스트리밍 도중이 아니라 완결 단위(문단)로 뜨는
          기본 동작에 맡긴다. */}
      {/* [2026-08-27 개편] dvh% 클램프를 flex-1 min-h-0로 교체 — 사용자 요청("대화창이 꽉 차지
          않고 작게 보인다", iPhone 16 Pro 실기기). 이전엔 62dvh 같은 퍼센트를 감으로 잡았는데,
          세로가 긴 기기에서는 그 상한 아래로 실제 여유 공간이 남아도 못 채웠다 — 그 캡을 보수적
          으로 잡은 이유 자체는 정당했다(모바일 하단 탭바+헤더+입력행을 다 얹으면 70dvh 이상에서
          페이지 자체가 세로 스크롤돼 스크롤 영역이 이중이 됐다), 다만 해결 방법이 틀렸다. 이제는
          이 컴포넌트가 감쌘 `Card`(위)와 `ChatPage.tsx`가 `Page fill`로 넘겨준 뷰포트-고정 높이
          체인(shared/ui/Page.tsx) 안에서 "남는 공간 전부"를 flex가 정확히 계산해 채운다 —
          퍼센트를 다시 조정할 필요 없이 헤더/입력행 높이가 바뀌어도 자동으로 맞다. */}
      <div
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto"
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
        {draft && <StreamingDraft draft={draft} stage={stage} retrying={retrying} />}
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-line bg-primary-soft px-3 py-2 text-sm text-primary">
          {error}
        </p>
      )}

      {/* 🚨 [2026-08-29] `min-w-0` + `shrink-0` 이 이 행의 계약이다. 320px 급 기기에서 입력창과
          「보내기」가 화면 밖으로 잘려 나갔다(사용자 리포트).

          원인은 **폼 컨트롤의 자동 최소 크기**다. `<input>` 은 `size` 속성(기본 20)에서 오는
          내재 폭을 갖고, flex 아이템의 `min-width: auto` 가 그 값으로 잡힌다 — `flex-1` 을 줘도
          약 200px 아래로는 **줄지 않는다.** 여기에 안 눌리는 버튼(약 76px)과 gap 8px 을 더하면
          최소 폭이 약 284px 인데, 카드 안쪽 폭은 320px 기기에서 254px 뿐이다. 부모(`Page fill`)가
          `overflow-hidden` 이라 넘친 만큼이 스크롤되지 않고 그냥 **잘렸다.**

          `min-w-0` 은 그 자동 최소 크기를 0 으로 되돌려 입력이 남는 폭을 받게 하고, `shrink-0` 은
          그 대가로 버튼이 눌리지 않게 한다. 둘은 **짝이다** — 한쪽만 주면 반대쪽이 뭉개진다.
          같은 짝을 `shared/ui/DateField.tsx`(INPUT_BASE)와 `TotalBudgetField` 가 이미 쓴다.

          ⚠️ D19(조판 규칙) 직후 이 자리가 더 나빠졌다. 종전엔 `overflow-wrap: anywhere` 가
          버튼의 최소 폭을 1글자로 만들어 「보/내/기」로 접히면서 넘침을 약 5px 로 **가리고**
          있었다. D19 가 그 붕괴를 막자 남아 있던 진짜 결함(입력의 최소 폭)이 그대로 드러났다.
          그때 훑은 flex 행 6곳에 이 행이 빠져 있었다 — 「버튼이 안 눌리는 만큼 압력은 옆 요소가
          받는다」는 D16 의 짝 규칙이 폼 컨트롤에도 그대로 적용된다는 것이 이 건의 교훈이다. */}
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
          className="min-h-tap min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-base text-ink disabled:opacity-50"
        />
        {/* [2026-08-27] 이전엔 raw <button>이라 shared/ui/Button.tsx의 `inline-flex items-center
            justify-center` 컨벤션이 빠져 있었다 — min-h-tap이 박스를 텍스트 줄높이보다 키울 때
            콘텐츠를 수직 중앙 정렬하는 이 프로젝트의 표준 방식인데, 여기만 누락돼 입력창과
            글자 위치가 안 맞아 보였다(사용자 리포트, 아이폰 실기기). 직접 유틸리티를 추가하는
            대신 공용 Button으로 교체 — 새 위치에서 같은 버그가 재발할 여지 자체를 없앤다. */}
        <Button className="shrink-0" onClick={() => void handleSend()} disabled={sending || !input.trim()}>
          보내기
        </Button>
      </div>
    </Card>
  );
}
