// features/entry-guard public API (§6.1.1) — 감지·판정·탈출 URL + 안내 화면(§6.2.1)
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
export { GuardScreen, type GuardScreenProps } from "./ui/GuardScreen";
