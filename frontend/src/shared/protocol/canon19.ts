// §4.4.1 관절 매핑 — MediaPipe Pose(33) → CANON19.
// ⚠ 게이트 G-3(AI Hub 라벨 ↔ CANON19 대조) 확정 전 잠정이다. 불일치가 확인되면
// 학습 셋 기준으로 **이 표만** 교체한다 (06 플랜 §8 — 수정 반경을 이 파일로 한정).
import { CANON19_JOINT_COUNT } from "./constants";

export const MEDIAPIPE_LANDMARK_COUNT = 33;

/** 직접 매핑 또는 두 랜드마크의 중점 합성 (§4.4.1) */
export type JointSource =
  | { readonly kind: "direct"; readonly index: number }
  | { readonly kind: "midpoint"; readonly a: number; readonly b: number };

export interface Canon19Joint {
  readonly name: string;
  readonly source: JointSource;
}

const direct = (index: number): JointSource => ({ kind: "direct", index });
const midpoint = (a: number, b: number): JointSource => ({ kind: "midpoint", a, b });

/**
 * CANON19 idx 순서 그대로 (§4.4.1 표). 얼굴 세부(1~10)·손끝(17~22)은 폐기.
 * 합성 관절(neck·mid_hip)의 visibility는 구성 관절의 최솟값.
 */
export const CANON19_JOINTS: readonly Canon19Joint[] = [
  { name: "nose", source: direct(0) },
  { name: "neck", source: midpoint(11, 12) },
  { name: "shoulder_l", source: direct(11) },
  { name: "shoulder_r", source: direct(12) },
  { name: "elbow_l", source: direct(13) },
  { name: "elbow_r", source: direct(14) },
  { name: "wrist_l", source: direct(15) },
  { name: "wrist_r", source: direct(16) },
  { name: "mid_hip", source: midpoint(23, 24) },
  { name: "hip_l", source: direct(23) },
  { name: "hip_r", source: direct(24) },
  { name: "knee_l", source: direct(25) },
  { name: "knee_r", source: direct(26) },
  { name: "ankle_l", source: direct(27) },
  { name: "ankle_r", source: direct(28) },
  { name: "heel_l", source: direct(29) },
  { name: "heel_r", source: direct(30) },
  { name: "foot_index_l", source: direct(31) },
  { name: "foot_index_r", source: direct(32) },
];

/**
 * §4.4.2 채널 순서. 정규 2채널은 오버레이·재생용, 월드 3채널(미터, 힙 중점 원점)은 각도 계산용,
 * visibility는 신뢰도 게이트용 — 단 visibility === 0을 확정적 가림으로 해석하지 않는다
 * (런타임이 ?? 0 기본값을 넣으므로 모델 미산출 시에도 0).
 */
export const CANON19_CHANNELS = [
  "x_norm",
  "y_norm",
  "x_world_m",
  "y_world_m",
  "z_world_m",
  "visibility",
] as const;

export type Canon19Channel = (typeof CANON19_CHANNELS)[number];

// 매핑표와 상수의 정합을 모듈 로드 시점에 단언한다 — 표 편집 실수를 즉시 검출 (§7.1)
if (CANON19_JOINTS.length !== CANON19_JOINT_COUNT) {
  throw new Error(`CANON19_JOINTS ${CANON19_JOINTS.length}개 ≠ CANON19_JOINT_COUNT ${CANON19_JOINT_COUNT} (§4.4.1)`);
}
