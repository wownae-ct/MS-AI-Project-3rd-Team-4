// 진입 경로 감지 — 답변 녹음 세션 시작 "전"에 판정한다. 순수 함수 유지(테스트 결정론).
// 인앱에서의 getUserMedia 재시도 루프·자동 새로고침은 구현하지 않는다 — Kakao 공식 답변: reload로 복구 불가.
import { IN_APP_UA_MARKERS, IOS_UA_PATTERN, KAKAO_OPEN_EXTERNAL_SCHEME, KAKAOTALK_UA_MARKER } from "@/shared/config";

/** 진입 판정 — GuardScreen이 이 값으로 분기한다 */
export type EntryVerdict =
  | { kind: "ok" }
  /** 인앱 웹뷰 — 외부 브라우저 유도 (카카오톡이면 전용 스킴 1단계 사용 가능) */
  | { kind: "in-app"; isKakao: boolean }
  /** iOS 비지원(정책 상속) — 인앱 탈출해도 WebKit이므로 탈출 유도 대신 비지원 안내 */
  | { kind: "unsupported-ios" }
  /** 필수 기능 부재 — 안내 화면 */
  | { kind: "unsupported-browser"; missing: readonly string[] };

/**
 * 지원 판정에 쓰는 필수 기능 존재 여부 — 수집은 collectFeatureSupport, 판정은 resolveEntryGuard.
 * Wake Lock은 여기 포함하지 않는다 — 부재 시에도 WakeLockManager가 "unsupported"로 우아하게
 * 저하되고 배너로만 안내한다(세션 자체를 막지 않음), 답변 녹음의 필수 조건이 아니다.
 */
export interface FeatureSupport {
  /** 답변 녹음용 마이크 접근 */
  getUserMedia: boolean;
  /** 답변 오디오 녹음 */
  mediaRecorder: boolean;
}

export function isInAppBrowser(ua: string): boolean {
  return IN_APP_UA_MARKERS.some((marker) => ua.includes(marker));
}

export function isKakaoTalk(ua: string): boolean {
  return ua.includes(KAKAOTALK_UA_MARKER);
}

/** 판정에 쓰는 환경 신호 — UA만으로 부족한 축 (테스트 주입 가능) */
export interface DeviceHints {
  /** iPadOS 13+ 데스크톱 모드 검출용 — UA가 "Macintosh"로 위장하므로 터치 지점 수로 구분 */
  maxTouchPoints?: number;
}

export function isIos(ua: string, hints: DeviceHints = {}): boolean {
  if (IOS_UA_PATTERN.test(ua)) return true;
  // iPadOS 13+는 기본이 데스크톱 UA(Macintosh) — 실제 Mac은 maxTouchPoints 0/1
  return ua.includes("Macintosh") && (hints.maxTouchPoints ?? 0) > 1;
}

/** 브라우저 전역에서 기능 존재를 수집한다 — jsdom 테스트에서는 객체를 직접 만들어 주입 */
export function collectFeatureSupport(): FeatureSupport {
  return {
    getUserMedia: typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
    mediaRecorder: typeof MediaRecorder !== "undefined",
  };
}

/**
 * 판정 순서 — iOS가 인앱보다 우선한다: iOS 인앱은 탈출해도 WebKit이라
 * 탈출 유도가 아니라 비지원 안내로 처리한다.
 */
export function resolveEntryGuard(ua: string, features: FeatureSupport, hints: DeviceHints = {}): EntryVerdict {
  if (isIos(ua, hints)) return { kind: "unsupported-ios" };
  if (isInAppBrowser(ua)) return { kind: "in-app", isKakao: isKakaoTalk(ua) };
  const missing = (Object.entries(features) as [keyof FeatureSupport, boolean][])
    .filter(([, ok]) => !ok)
    .map(([name]) => name);
  if (missing.length > 0) return { kind: "unsupported-browser", missing };
  return { kind: "ok" };
}

/** 탈출 3단계 URL — ① 카카오 전용 스킴 ② intent:// 폴백 ③ URL 복사(항상 병행 노출) */
export interface EscapeUrls {
  /** 카카오톡 한정 — 커뮤니티 검증 패턴(공식 미문서화): 실패 대비로 ②③을 항상 함께 제공 */
  kakaoScheme: string;
  /** Android intent 폴백 — https 스킴으로 기본 브라우저 열기 */
  intentUri: string;
  /** 복사 버튼용 원본 URL */
  plainUrl: string;
}

export function buildEscapeUrls(currentUrl: string): EscapeUrls {
  const url = new URL(currentUrl);
  return {
    kakaoScheme: `${KAKAO_OPEN_EXTERNAL_SCHEME}${encodeURIComponent(currentUrl)}`,
    intentUri: `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;end`,
    plainUrl: currentUrl,
  };
}
