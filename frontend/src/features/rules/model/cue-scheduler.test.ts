// 「모델·오디오」 디바운스·우선순위 검증 — 가짜 시계로 결정론화.
import { describe, expect, it } from "vitest";
import { CueScheduler, type CueRequest } from "./cue-scheduler";
import { CUE_MIN_INTERVAL_MS } from "../../../shared/config";

function setup() {
  let nowMs = 0;
  const played: string[] = [];
  const scheduler = new CueScheduler((c) => played.push(c.id), () => nowMs);
  return { scheduler, played, advance: (ms: number) => (nowMs += ms) };
}

const cue = (id: string, priority: CueRequest["priority"]): CueRequest => ({ id, priority });

describe("CueScheduler (§4.5.2 · 「모델·오디오」)", () => {
  it("쿨다운 밖 요청은 즉시 재생", () => {
    const { scheduler, played } = setup();
    scheduler.request(cue("knee-in", "form"));
    expect(played).toEqual(["knee-in"]);
  });

  it("쿨다운 중 동·하위 우선순위는 대기 슬롯을 빼앗지 못한다", () => {
    const { scheduler, played, advance } = setup();
    scheduler.request(cue("first", "form"));
    scheduler.request(cue("second-form", "form"));
    scheduler.request(cue("cheer", "encourage"));
    advance(CUE_MIN_INTERVAL_MS);
    scheduler.tick();
    expect(played).toEqual(["first", "second-form"]); // encourage는 form 대기를 대체 못함
  });

  it("안전 큐는 쿨다운 중 대기 슬롯을 선점한다 (안전 > 폼 > 격려)", () => {
    const { scheduler, played, advance } = setup();
    scheduler.request(cue("form-cue", "form"));
    scheduler.request(cue("form-2", "form"));
    scheduler.request(cue("back-danger", "safety")); // form-2 대기를 대체
    advance(CUE_MIN_INTERVAL_MS);
    scheduler.tick();
    expect(played).toEqual(["form-cue", "back-danger"]);
  });

  it("쿨다운 경과 전 tick은 무동작 — 디바운스 간격 보장", () => {
    const { scheduler, played, advance } = setup();
    scheduler.request(cue("a", "form"));
    scheduler.request(cue("b", "safety"));
    advance(CUE_MIN_INTERVAL_MS - 1);
    scheduler.tick();
    expect(played).toEqual(["a"]);
    advance(1);
    scheduler.tick();
    expect(played).toEqual(["a", "b"]);
  });

  it("대기 방출도 새 쿨다운을 시작한다 (연속 방출 방지)", () => {
    const { scheduler, played, advance } = setup();
    scheduler.request(cue("a", "form"));
    scheduler.request(cue("b", "form"));
    advance(CUE_MIN_INTERVAL_MS);
    scheduler.tick(); // b 방출 — 쿨다운 리셋
    scheduler.request(cue("c", "safety"));
    expect(played).toEqual(["a", "b"]); // c는 대기
    advance(CUE_MIN_INTERVAL_MS);
    scheduler.tick();
    expect(played).toEqual(["a", "b", "c"]);
  });
});
