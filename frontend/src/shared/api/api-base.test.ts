// VITE_API_BASE 형식 계약. 21 케이스는 설계 시 실행해 확정한 것이다
// (docs/architecture/backend-integration.md §2.3).
//
// 왜 정규식이 아니라 URL 파서인가 — 정규식판은 `HTTPS://HOST` 를 과차단했고(RFC 3986 상
// 스킴은 대소문자 무관) `javascript:` 를 「경로 금지」로 오진했다. 진단이 원인을 안 가리키면
// 사용자를 엉뚱한 곳으로 보낸다.
import { describe, expect, it } from "vitest";
import { checkApiBase, isLoopbackApiBase } from "./api-base";

const OK = [
  "http://localhost:8000",
  "http://localhost",
  "http://127.0.0.1:8000",
  "http://[::1]:8000",
  "https://20-249-52-148.nip.io",
  "HTTPS://HOST",
  "https://xn--o39an51b.com",
];

const BAD: Array<[unknown, string]> = [
  ["", "빈 값"],
  ["   ", "공백뿐"],
  [undefined, "미주입"],
  ["localhost:8000", "스킴 없음"],
  ["https://", "호스트 없음"],
  ["file:///etc/passwd", "지원하지 않는 스킴"],
  ["javascript:alert(1)", "지원하지 않는 스킴"],
  ["http://20-249-52-148.nip.io", "원격에 http"],
  ["http://localhost.evil.com", "localhost 접두 위장"],
  ["https://host/api/v1", "경로 포함"],
  ["https://host?x=1", "쿼리 포함"],
  ["https://host#f", "해시 포함"],
  ["https://u:p@host", "자격증명 포함"],
  ["https://20-249-52-148.nip.io/", "끝 슬래시"],
];

describe("checkApiBase", () => {
  it.each(OK)("통과: %s", (value) => {
    expect(checkApiBase(value)).toBeNull();
  });

  it.each(BAD)("차단: %s (%s)", (value) => {
    expect(checkApiBase(value)).toEqual(expect.any(String));
  });

  it("스킴 위반은 경로가 아니라 스킴을 진단한다 — 오진이 사용자를 엉뚱한 곳으로 보낸다", () => {
    expect(checkApiBase("javascript:alert(1)")).toContain("스킴");
  });

  it("원격 http 는 §5.11 사고를 인용해 진단한다", () => {
    expect(checkApiBase("http://api.example.com")).toContain("루프백");
  });
});

describe("isLoopbackApiBase", () => {
  it("루프백 3종을 알아본다", () => {
    expect(isLoopbackApiBase("http://localhost:8000")).toBe(true);
    expect(isLoopbackApiBase("http://127.0.0.1:8000")).toBe(true);
    expect(isLoopbackApiBase("http://[::1]:8000")).toBe(true);
  });

  it("원격 호스트는 아니다", () => {
    expect(isLoopbackApiBase("https://20-249-52-148.nip.io")).toBe(false);
  });

  it("파싱 불가는 루프백이 아니다 — 배포 게이트가 이걸 통과시키면 안 된다", () => {
    expect(isLoopbackApiBase("nonsense")).toBe(false);
  });
});

describe("배포 빌드 규칙 — 형식 통과와 배포 가능은 다르다", () => {
  // 판정 시점은 mode 가 아니라 CI 다 — `vite build` 는 기본 mode 가 production 이라
  // mode 로 잡으면 로컬 4게이트가 매번 죽는다. 게이트 자체는 vite.config.ts 에 있고
  // 여기서는 그 게이트가 쓰는 두 함수의 역할 분담만 고정한다.
  it("로컬 값은 형식은 통과하지만 배포에는 쓸 수 없다", () => {
    const local = "http://localhost:8000";
    expect(checkApiBase(local)).toBeNull(); // 형식 OK
    expect(isLoopbackApiBase(local)).toBe(true); // 배포 게이트가 잡는다
  });

  it("운영 값은 둘 다 통과한다", () => {
    const remote = "https://20-249-52-148.nip.io";
    expect(checkApiBase(remote)).toBeNull();
    expect(isLoopbackApiBase(remote)).toBe(false);
  });
});
