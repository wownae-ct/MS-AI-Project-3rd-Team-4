// §6.2.1 진입 경로 상수 — 하드코딩 금지 규정에 따라 UA 목록은 여기가 단일 출처다.
// 규범 원문(v2.1 C2-03) 대조: KAKAOTALK · Instagram · FBAN/FBAV · Line/ · NAVER(inapp.

/**
 * 인앱 브라우저(웹뷰) 감지 UA 부분 문자열 — 초기값 (§6.2.1).
 * ⚠ 웨일 '브라우저'(UA `Whale/`)는 지원 대상(§6.3)이다 — 네이버 '앱'의 인앱 웹뷰(`NAVER(inapp`)와
 *   혼동해 차단하지 말 것 (규범 명시 주의사항).
 */
export const IN_APP_UA_MARKERS = [
  "KAKAOTALK",
  "Instagram",
  "FBAN", // 페이스북 앱
  "FBAV", // 페이스북 앱 (구형 표기)
  "Line/",
  "NAVER(inapp", // 네이버 앱 인앱 — Whale 브라우저와 별개
] as const;

/** 카카오톡 판별 마커 — 탈출 1단계(전용 스킴)는 카카오톡 한정이다 (§6.2.1) */
export const KAKAOTALK_UA_MARKER = "KAKAOTALK";

/** iOS 계열 판별 — iOS는 전체 비지원(스코프컷 §6.3). 인앱 탈출 유도 대신 비지원 안내 (§6.2.1) */
export const IOS_UA_PATTERN = /iPhone|iPad|iPod/i;

/**
 * §6.2.1 탈출 1단계 — 카카오톡 전용 스킴 (커뮤니티 검증 패턴, 공식 미문서화 —
 * 실기 확인이 §7.5 수용 기준, 변경·차단 리스크는 R-3. URL 복사 3차 경로를 항상 병행 노출).
 */
export const KAKAO_OPEN_EXTERNAL_SCHEME = "kakaotalk://web/openExternal?url=";
