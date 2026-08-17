// features/entry-guard public API (§6.1.1) — 감지·판정·탈출 URL. GuardScreen UI는 M4에서 조립.
export {
  buildEscapeUrls,
  collectFeatureSupport,
  isInAppBrowser,
  isIos,
  isKakaoTalk,
  resolveEntryGuard,
  type EntryVerdict,
  type EscapeUrls,
  type FeatureSupport,
} from "./lib/detect";
