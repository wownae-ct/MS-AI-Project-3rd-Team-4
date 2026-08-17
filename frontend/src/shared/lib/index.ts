// shared/lib public API (§6.1.1) — telemetry(M5 §6.5)·audio-unlock(M4 §4.5.2)는 추후 추가.
export {
  WakeLockManager,
  type WakeLockManagerOptions,
  type WakeLockState,
  type WakeLockTelemetryEvent,
} from "./wake-lock";
