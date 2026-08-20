// @vitest-environment node
// 전역 스토어 검증. 이 스토어는 모듈 싱글턴이라 테스트 간 상태가 새는 것이 1급 위험이다 —
// 각 테스트가 reset()으로 시작하고, reset이 전 필드를 되돌리는지도 직접 확인한다.
import { beforeEach, describe, expect, it } from "vitest";
import { practiceStore } from "./practice-store";

const INITIAL = {
  sessionId: null,
  category: null,
  questionId: null,
  recordingState: "idle",
  answerId: null,
} as const;

function summary() {
  const { sessionId, category, questionId, recordingState, answerId } = practiceStore.getState();
  return { sessionId, category, questionId, recordingState, answerId };
}

beforeEach(() => {
  practiceStore.getState().reset();
});

describe("초기 상태", () => {
  it("모든 식별자가 비어 있고 녹음은 idle이다", () => {
    expect(summary()).toEqual(INITIAL);
  });
});

describe("상태 전이", () => {
  it("setSession은 sessionId만 바꾼다", () => {
    practiceStore.getState().setSession("s-1");
    expect(summary()).toEqual({ ...INITIAL, sessionId: "s-1" });
  });

  it("selectQuestion은 category와 questionId를 함께 설정한다", () => {
    practiceStore.getState().selectQuestion("tech_interview", "q-1");
    const s = summary();
    expect(s.category).toBe("tech_interview");
    expect(s.questionId).toBe("q-1");
  });

  it("selectQuestion은 category와 questionId를 서로 다른 값으로 받는다", () => {
    practiceStore.getState().selectQuestion("customer_explain", "q-42");
    const s = summary();
    expect(s.questionId).not.toBe(s.category);
    expect(s.questionId).toBe("q-42");
  });

  it("selectCategory는 카테고리만 정하고 questionId는 비워 둔다", () => {
    // 회귀 방어 — 한때 호출부가 category를 questionId 자리에 넘겨 없는 식별자를 지어냈다.
    // "카테고리는 정해졌고 질문은 미정"이 표현 가능해야 그 유혹이 사라진다.
    practiceStore.getState().selectCategory("tech_interview");
    expect(summary()).toEqual({ ...INITIAL, category: "tech_interview" });
  });

  it("카테고리를 바꾸면 이전 질문은 무효가 된다", () => {
    const s = practiceStore.getState();
    s.selectQuestion("tech_interview", "q-1");
    expect(practiceStore.getState().questionId).toBe("q-1");

    s.selectCategory("incident_report");
    expect(practiceStore.getState().questionId).toBeNull();
    expect(practiceStore.getState().category).toBe("incident_report");
  });

  it("setRecordingState는 녹음 상태만 바꾼다", () => {
    practiceStore.getState().setRecordingState("recording");
    expect(summary()).toEqual({ ...INITIAL, recordingState: "recording" });
  });

  it("녹음 생명주기를 순서대로 통과시킨다", () => {
    const flow = ["recording", "uploading", "processing", "done"] as const;
    for (const state of flow) {
      practiceStore.getState().setRecordingState(state);
      expect(practiceStore.getState().recordingState).toBe(state);
    }
  });

  it("setAnswerId는 answerId만 바꾼다", () => {
    practiceStore.getState().setAnswerId("a-1");
    expect(summary()).toEqual({ ...INITIAL, answerId: "a-1" });
  });
});

describe("reset", () => {
  it("전 필드를 초기값으로 되돌린다 — 일부만 되돌리면 세션 간 상태가 샌다", () => {
    const s = practiceStore.getState();
    s.setSession("s-1");
    s.selectQuestion("incident_report", "q-9");
    s.setRecordingState("done");
    s.setAnswerId("a-1");
    expect(summary()).not.toEqual(INITIAL);

    practiceStore.getState().reset();
    expect(summary()).toEqual(INITIAL);
  });
});

describe("구독", () => {
  it("상태가 바뀌면 구독자에게 알린다", () => {
    const seen: string[] = [];
    const unsubscribe = practiceStore.subscribe((s) => seen.push(s.recordingState));

    practiceStore.getState().setRecordingState("recording");
    practiceStore.getState().setRecordingState("processing");
    unsubscribe();
    practiceStore.getState().setRecordingState("done");

    expect(seen).toEqual(["recording", "processing"]);
  });
});
