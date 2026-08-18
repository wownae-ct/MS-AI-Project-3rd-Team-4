// shared/workers public API — window-assembler는 Worker 내부 전용 로직이다 (§4.4.0:
// 조립은 Worker 소유, 메인은 헤더+send만). 메인 스레드 코드에서 import하지 말 것.
export { assembleWindow, WindowCollector, FLOATS_PER_FRAME, type AssembledWindow, type TimedFrame } from "./window-assembler";
