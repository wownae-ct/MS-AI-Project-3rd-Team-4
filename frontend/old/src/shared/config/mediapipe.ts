// §6.2 — WASM·모델 self-hosting 경로 (CDN 하드코딩 금지 P0).
// 자산 실물·해시·갱신 규칙은 frontend/public/mediapipe/README.md.

/** FilesetResolver.forVisionTasks에 넘길 동일 오리진 wasm 경로 */
export const MEDIAPIPE_WASM_PATH = "/mediapipe/wasm";

/** pose_landmarker 모델 (Lite: 모바일 중급기 기본 · Full: 데스크톱 — 선택 정책은 M3 §4.3) */
export const POSE_LANDMARKER_LITE_PATH = "/mediapipe/models/pose_landmarker_lite.task";
export const POSE_LANDMARKER_FULL_PATH = "/mediapipe/models/pose_landmarker_full.task";
