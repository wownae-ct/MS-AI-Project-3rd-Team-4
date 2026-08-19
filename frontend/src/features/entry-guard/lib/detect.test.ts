// 진입 판정 테스트 — 실 UA 픽스처 기반. 특히 "웨일 브라우저를 인앱으로 오차단하지 않는가"가 1급 회귀다.
import { describe, expect, it } from "vitest";
import { buildEscapeUrls, isInAppBrowser, resolveEntryGuard, type FeatureSupport } from "./detect";

const ALL_OK: FeatureSupport = { getUserMedia: true, mediaRecorder: true };

// 대표 UA 픽스처 (구조 재현 — 버전 문자열은 판정에 무관)
const UA = {
  kakaoAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36 KAKAOTALK/10.4.5",
  instagram:
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36 Instagram 300.0.0.0",
  facebook:
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/123.0.0.0 Mobile Safari/537.36 [FBAN/FB4A;FBAV/450.0.0.0;]",
  line: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/123.0.0.0 Mobile Safari/537.36 Line/13.0.0",
  naverInApp:
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/123.0.0.0 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.0.0)",
  whaleBrowser:
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Whale/3.25.232.19 Mobile Safari/537.36",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36",
  iosSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iosKakao:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.4.5",
} as const;

describe("인앱 감지 (§6.2.1 UA 목록)", () => {
  it.each([
    ["카카오톡", UA.kakaoAndroid],
    ["인스타그램", UA.instagram],
    ["페이스북(FBAN/FBAV)", UA.facebook],
    ["라인", UA.line],
    ["네이버 앱 인앱", UA.naverInApp],
  ])("%s → 인앱", (_name, ua) => {
    expect(isInAppBrowser(ua)).toBe(true);
  });

  it("⚠ 웨일 '브라우저'는 지원 대상 — 인앱으로 오차단 금지 (규범 명시 주의, §6.3)", () => {
    expect(isInAppBrowser(UA.whaleBrowser)).toBe(false);
    expect(resolveEntryGuard(UA.whaleBrowser, ALL_OK)).toEqual({ kind: "ok" });
  });
});

describe("판정 우선순위", () => {
  it("일반 Chrome Android + 전 기능 → ok", () => {
    expect(resolveEntryGuard(UA.chromeAndroid, ALL_OK)).toEqual({ kind: "ok" });
  });

  it("카카오톡 Android → in-app (전용 스킴 1단계 가능)", () => {
    expect(resolveEntryGuard(UA.kakaoAndroid, ALL_OK)).toEqual({ kind: "in-app", isKakao: true });
  });

  it("인스타그램 → in-app (전용 스킴 없음 — intent·URL 복사만)", () => {
    expect(resolveEntryGuard(UA.instagram, ALL_OK)).toEqual({ kind: "in-app", isKakao: false });
  });

  it("iOS는 인앱 여부와 무관하게 비지원 안내 — 탈출해도 WebKit", () => {
    expect(resolveEntryGuard(UA.iosSafari, ALL_OK)).toEqual({ kind: "unsupported-ios" });
    expect(resolveEntryGuard(UA.iosKakao, ALL_OK)).toEqual({ kind: "unsupported-ios" });
  });

  it("iPadOS 13+ 데스크톱 UA(Macintosh + 멀티터치) → 비지원 안내 — UA만으로는 Mac과 구분 불가", () => {
    const ipadDesktopUa =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
    expect(resolveEntryGuard(ipadDesktopUa, ALL_OK, { maxTouchPoints: 5 })).toEqual({ kind: "unsupported-ios" });
    // 실제 Mac(터치 0)은 iOS로 오판하지 않는다 — Mac Safari는 기능 검사(rVFC 부재)로 걸러진다
    expect(resolveEntryGuard(ipadDesktopUa, ALL_OK, { maxTouchPoints: 0 })).toEqual({ kind: "ok" });
  });

  it("MediaRecorder 부재 = 비지원 브라우저 — 답변 녹음이 불가능하므로 안내 화면", () => {
    const verdict = resolveEntryGuard(UA.chromeAndroid, { ...ALL_OK, mediaRecorder: false });
    expect(verdict).toEqual({ kind: "unsupported-browser", missing: ["mediaRecorder"] });
  });
});

describe("탈출 3단계 URL", () => {
  const current = "https://app.example.com/session/start?m=squat";

  it("① 카카오 전용 스킴 — URL 인코딩 필수", () => {
    const { kakaoScheme } = buildEscapeUrls(current);
    expect(kakaoScheme).toBe(`kakaotalk://web/openExternal?url=${encodeURIComponent(current)}`);
  });

  it("② intent:// 폴백 — host+path+query 유지, scheme=https", () => {
    const { intentUri } = buildEscapeUrls(current);
    expect(intentUri).toBe("intent://app.example.com/session/start?m=squat#Intent;scheme=https;end");
  });

  it("③ URL 복사 경로는 원본 그대로 (항상 병행 노출 전제)", () => {
    expect(buildEscapeUrls(current).plainUrl).toBe(current);
  });
});
