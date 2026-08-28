// shared/ui public API (§6.1.1) — 스타일(styles.css)은 app 진입점에서 1회 import한다.
// CSS 는 사이드이펙트라 여기서 재수출할 수 없다 (layers.md §4.2).
export { Badge, type BadgeProps } from "./Badge";
// 브랜드 락업 (D15) — 셸(사이드바·모바일 상단바)과 셸 밖 화면(로그인·온보딩·생성 오버레이)이 함께 쓴다.
export { Brand, type BrandProps } from "./Brand";
export { Button, type ButtonProps, type ButtonVariant } from "./Button";
export { Card, type CardProps } from "./Card";
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
