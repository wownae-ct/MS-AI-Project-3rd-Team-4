// 대화 목록의 「맨 아래 따라가기」 — ChatPanel.tsx 에서 분리(2026-08-30, eslint max-lines 300줄
// 제한). MessageBubble.tsx · TypingIndicator.tsx · StreamingDraft.tsx 가 같은 사유로 먼저 갈라져
// 나간 선례를 따른다.
//
// **왜 필요한가.** 종전 ChatPanel 은 `[messages, draft]` 가 바뀔 때마다 **무조건** 목록을 맨 아래로
// 끌어내렸다. 스트리밍은 토큰마다 draft 를 바꾸므로, 답변이 오는 동안 위로 올려 읽는 것이
// **물리적으로 불가능**했다 — 손가락으로 올려도 다음 토큰이 즉시 도로 내렸다(사용자 리포트
// 2026-08-30 "채팅을 보기가 불편함"). 모바일에서 대화창이 333px 밖에 안 되던 것과 합쳐져
// 「짧고 못 읽는 창」이 됐다. 창을 넓히는 것만으로는 이쪽이 안 닫힌다.
//
// **판정은 ref 에, 표시는 state 에 둔다.** 「따라가는 중인가」는 아래 effect 가 **동기적으로 최신
// 값**을 읽어야 하므로 state 면 한 렌더 뒤처진 값을 본다. 반대로 「맨 아래로」 버튼은 화면에 보여야
// 하므로 state 여야 한다. 둘은 항상 반대값이고 **같은 함수 안에서만** 갱신하므로 갈리지 않는다.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../model";
import type { DraftAssistantMessage } from "./StreamingDraft";

// 목록 끝에서 이 거리 안에 있으면 「따라가는 중」으로 본다. 0 으로 두면 스트리밍이 늘린 몇 px
// 때문에 판정이 매 토큰 흔들린다.
const BOTTOM_STICKY_PX = 64;

export interface StickyScroll {
  /** 스크롤 컨테이너에 그대로 단다. */
  listRef: React.RefObject<HTMLDivElement | null>;
  /** 그 컨테이너의 `onScroll` 에 그대로 단다. */
  onListScroll: () => void;
  /** 사용자가 위로 올려 읽는 중 — 「맨 아래로」 버튼을 띄울 때다. */
  awayFromBottom: boolean;
  /** 「맨 아래로」 버튼의 동작. */
  jumpToBottom: () => void;
  /** 다시 맨 아래에 붙인다(스크롤은 다음 갱신이 한다) — 세션 전환 · 내가 보낸 메시지. */
  stickToBottom: () => void;
}

export function useStickyScroll(messages: ChatMessage[], draft: DraftAssistantMessage | null): StickyScroll {
  const listRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const [awayFromBottom, setAwayFromBottom] = useState(false);

  useEffect(() => {
    if (!stickRef.current) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, draft]);

  // 🚨 세 함수 모두 `useCallback([])` 이다 — **호출부의 effect 의존성에 들어가기 때문이다.**
  // 매 렌더 새 함수가 되면 `ChatPanel` 의 세션 전환 effect 가 렌더마다 재실행되고, 그 effect 는
  // 진행 중인 SSE 스트림을 abort 하므로 답변이 첫 토큰에서 끊긴다. ref 와 setState 만 쓰므로
  // 잡아 둘 값이 없어 빈 배열이 정확하다.

  // 위 effect 의 프로그램 스크롤도 이 핸들러를 태우므로, 맨 아래에 닿는 순간 자동으로 다시
  // 붙는다 — 되돌리는 코드를 따로 두지 않는다.
  const onListScroll = useCallback(() => {
    const list = listRef.current;
    if (list === null) return;
    const stick = list.scrollHeight - list.scrollTop - list.clientHeight <= BOTTOM_STICKY_PX;
    stickRef.current = stick;
    setAwayFromBottom(!stick);
  }, []);

  const jumpToBottom = useCallback(() => {
    const list = listRef.current;
    if (list === null) return;
    stickRef.current = true;
    setAwayFromBottom(false);
    list.scrollTo({ top: list.scrollHeight });
  }, []);

  const stickToBottom = useCallback(() => {
    stickRef.current = true;
    setAwayFromBottom(false);
  }, []);

  return { listRef, awayFromBottom, onListScroll, jumpToBottom, stickToBottom };
}
