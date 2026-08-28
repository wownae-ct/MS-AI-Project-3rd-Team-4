// shared/ui public API (§6.1.1) — 스타일(styles.css)은 app 진입점에서 1회 import한다.
// CSS 는 사이드이펙트라 여기서 재수출할 수 없다 (layers.md §4.2).
export { Badge, type BadgeProps } from "./Badge";
// 브랜드 락업 (D15) — 셸(사이드바·모바일 상단바)과 셸 밖 화면(로그인·온보딩·생성 오버레이)이 함께 쓴다.
export { Brand, type BrandProps } from "./Brand";
export { Button, type ButtonProps, type ButtonVariant } from "./Button";
export { Card, type CardProps } from "./Card";
// 되돌릴 수 없는 행동의 확인 다이얼로그 — 지금은 "AI 다시 생성"(entities/personalization)이
// 유일한 호출부지만, 삭제류 행동이 늘면 같은 자리로 온다.
export { ConfirmDialog, type ConfirmDialogProps } from "./ConfirmDialog";
// 온보딩 8단계에서 뽑아 올린 두 장치(2026-08-29, 아래 StatusCallout 과 짝) — 예산 재배분 화면이
// 같은 것을 써야 하는데 pages 슬라이스끼리는 서로 import 할 수 없다. 각 파일 머리말에 "왜
// 마크업을 복사하면 안 되는지"(실제로 깨졌던 불변식들)를 적어 뒀다.
export { DisclosurePanel, type DisclosurePanelProps } from "./DisclosurePanel";
export { ErrorBoundary, type ErrorBoundaryProps } from "./ErrorBoundary";
// 로딩 상태 (D14) — 화면들이 이 배럴을 이미 import 하고 있으므로 여기로 내보내면
// 호출부의 import 개수가 늘지 않는다(체크리스트 탭·온보딩은 의존성 상한에 이미 닿아 있다).
export { Loading, type LoadingProps } from "./Loading";
export { Money, type MoneyProps } from "./Money";
export { NumberInput, type NumberInputProps } from "./NumberInput";
export { Page, PAGE_CONTENT_ID, type PageProps } from "./Page";
export { Progress, type ProgressProps } from "./Progress";
export { PulseDots, type PulseDotsProps, type PulseDotsVariant } from "./PulseDots";
export { RoutePending } from "./RoutePending";
export { SkeletonRows, type SkeletonRowsProps } from "./Skeleton";
// 근거·출처 목록 (D16) — 채팅 인용 · 체크리스트 근거 · 업체사례 관련 사례가 같은 그릇을 쓴다.
// entities 끼리는 서로를 import 할 수 없으므로 공유 지점은 여기뿐이다(safe-url·source-tier 와 같은 이유).
export { SourceList, type SourceListItem, type SourceListProps } from "./SourceList";
export { StatusCallout, type StatusCalloutProps } from "./StatusCallout";
export { Tabs, type TabsRootProps } from "./Tabs";
export {
  IconCalendar,
  IconChart,
  IconChat,
  IconCheck,
  IconChevronDown,
  IconGoogle,
  IconHome,
  IconInfo,
  IconNaver,
  IconSettings,
  IconWallet,
  type IconProps,
} from "./icons";
