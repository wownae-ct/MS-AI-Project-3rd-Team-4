// @vitest-environment node
// §1.1 두 층 분리 검증 — "transient 쓰기가 스토어 알림을 유발하지 않는다"가 1급 회귀다.
import { afterEach, describe, expect, it } from "vitest";
import { createSummaryThrottle, sessionStore, transientPose, writeTransientPose } from "./session-store";
import { SUMMARY_UPDATE_INTERVAL_MS } from "../../shared/config";

afterEach(() => {
  sessionStore.getState().resetSession();
  transientPose.landmarks = null;
  transientPose.tOffsetMs = 0;
});

describe("sessionStore — 요약치 층", () => {
  it("연결 상태는 즉시 반영 + 구독 알림", () => {
    let notified = 0;
    const unsub = sessionStore.subscribe(() => {
      notified += 1;
    });
    sessionStore.getState().setConnection("CONNECTED");
    expect(sessionStore.getState().connection).toBe("CONNECTED");
    expect(notified).toBe(1);
    unsub();
  });

  it("resetSession — 초기 요약치 복원", () => {
    sessionStore.getState().applySummary({ repCount: 7, currentFaultCode: "KNEE_IN", setIndex: 2 });
    sessionStore.getState().resetSession();
    expect(sessionStore.getState().repCount).toBe(0);
    expect(sessionStore.getState().currentFaultCode).toBeNull();
  });
});

describe("transient 층 (§1.1 — React 승격 금지)", () => {
  it("⚠ transient 쓰기는 스토어 구독자에게 알림을 발생시키지 않는다", () => {
    let notified = 0;
    const unsub = sessionStore.subscribe(() => {
      notified += 1;
    });
    writeTransientPose(new Float32Array([0.1, 0.2]), 1234);
    expect(notified).toBe(0); // rAF가 직접 읽는 경로 — 렌더 트리거 없음
    expect(transientPose.landmarks?.length).toBe(2);
    expect(transientPose.tOffsetMs).toBe(1234);
    unsub();
  });
});

describe("createSummaryThrottle — 10Hz 스로틀", () => {
  it("간격 내 연속 push는 병합만, 간격 경과 시 1회 반영", () => {
    let nowMs = 0;
    const applied: object[] = [];
    const throttle = createSummaryThrottle((p) => applied.push(p), () => nowMs);
    throttle.push({ repCount: 1 }); // 첫 push는 즉시 (마지막 반영이 -∞)
    throttle.push({ repCount: 2 });
    throttle.push({ currentFaultCode: "KNEE_IN" });
    expect(applied).toEqual([{ repCount: 1 }]);
    nowMs += SUMMARY_UPDATE_INTERVAL_MS;
    throttle.push({ repCount: 3 });
    expect(applied).toEqual([{ repCount: 1 }, { repCount: 3, currentFaultCode: "KNEE_IN" }]); // 병합 반영
  });

  it("flush — 대기 패치 강제 반영 (세션 종료 경로)", () => {
    let nowMs = 0;
    const applied: object[] = [];
    const throttle = createSummaryThrottle((p) => applied.push(p), () => nowMs);
    throttle.push({ repCount: 1 });
    throttle.push({ repCount: 2 });
    throttle.flush();
    expect(applied).toEqual([{ repCount: 1 }, { repCount: 2 }]);
  });
});
