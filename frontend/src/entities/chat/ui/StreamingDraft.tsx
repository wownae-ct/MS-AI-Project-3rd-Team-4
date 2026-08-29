// 스트리밍 중인 답변 한 덩어리 — ChatPanel.tsx에서 분리(2026-08-29, eslint max-lines 300줄
// 제한). MessageBubble.tsx·TypingIndicator.tsx가 같은 사유로 먼저 갈라져 나간 선례를 따른다.
// 이 컴포넌트는 ChatPanel의 state를 props로 받기만 하는 순수 프레젠테이션이다.
//
// **CRAG 재시도 구간의 표시가 이 파일의 존재 이유다.** verify가 WEAK/GENERAL이면 백엔드가
// retrieve→generate→verify를 최대 1회 다시 돌고(backend/app/rag/graph.py), 그 직전에 `retry`
// 이벤트를 흘려보낸다. 예전에는 그 신호를 받는 즉시 1차 답변 토큰을 통째로 버려서, 사용자가
// 방금까지 읽고 있던 문장이 눈앞에서 사라지고 빈 화면이 됐다(레드팀 감사 #16). 이제는
// **2차 첫 토큰이 실제로 도착할 때까지 1차 답변을 그대로 두고**(교체 시점을 미루는 로직은
// ChatPanel.handleSend의 onToken/onRetry에 있다) 여기서는 "다시 찾는 중"이라는 사실만 덧붙인다.
import type { ChatCitation, ChatStage, ChatVerification } from "../model";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";

// 스트리밍 중인 답변을 완결된 ChatMessage 처럼 다루기 위한 임시 형태 — id 는 아직 서버가
// 발급하지 않았으므로(done 이벤트에서야 message_id 가 온다) 프론트에서만 쓰는 자리표시자.
export interface DraftAssistantMessage {
  content: string;
  citations?: ChatCitation[];
  verification?: ChatVerification;
}

// stage 이벤트(2026-08-24 백엔드 세션 추가) 라벨 — 챗 그래프 3노드(retrieve→generate→verify)
// 이름과 1:1. 사용자 요청 "진행상황이 보이게해야지"에 대응하는 실제 표시 문구.
const STAGE_LABELS: Record<ChatStage, string> = {
  retrieve: "근거를 찾고 있어요",
  generate: "답변을 작성하고 있어요",
  verify: "답변을 검증하고 있어요",
};

const RETRY_LABEL = "더 정확한 답변을 다시 찾고 있어요";
const NOTE = "text-xs text-ink-soft";

export interface StreamingDraftProps {
  draft: DraftAssistantMessage;
  stage: ChatStage | null;
  /** CRAG 재검색이 진행 중 — 화면에 남아 있는 답변이 아직 1차 결과라는 뜻이다. */
  retrying: boolean;
}

export function StreamingDraft({ draft, stage, retrying }: StreamingDraftProps) {
  // 토큰이 하나도 없는 구간 — "스트리밍 중"과 "아직 시작 안 함"을 구분해서 보여준다(사용자
  // 요청: "진행상황이 보이게"). 재시도인데 여기로 오는 경우도 여전히 있다 — 1차 시도가 검색
  // 0건이라 토큰 없이 곧바로 GENERAL로 확정된 경로(graph.py의 NO_CONTEXT 분기)에는 남겨 둘
  // 1차 답변 자체가 없다.
  if (draft.content === "") {
    return <TypingIndicator label={stage ? STAGE_LABELS[stage] : retrying ? RETRY_LABEL : "답변을 준비하고 있어요"} />;
  }

  return (
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
      {/* 재검색 안내가 verify 안내보다 우선한다 — 재시도 중이라면 위 말풍선은 이미 "버려질
          예정인 1차 답변"이라, 그 사실을 알리는 쪽이 검증 단계 표시보다 중요하다. */}
      {retrying ? (
        <p className={NOTE}>{RETRY_LABEL}</p>
      ) : (
        // 토큰은 이미 나오는데 verify 노드가 아직 안 끝난 구간 — 답변 문장은 다 왔지만 근거
        // 검증 중이라 verification 배지가 아직 안 붙는다는 걸 알려준다.
        stage === "verify" && !draft.verification && <p className={NOTE}>{STAGE_LABELS.verify}</p>
      )}
    </div>
  );
}
