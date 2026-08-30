// shared/ui public API (§6.1.1) — 스타일(styles.css)은 app 진입점에서 1회 import한다.
// CSS 는 사이드이펙트라 여기서 재수출할 수 없다 (layers.md §4.2).
export { Badge, type BadgeProps, type BadgeVariant } from "./Badge";
// 제목 위 내비 줄 (D25) — `Page` 의 `nav` 슬롯에 들어가는 두 컴포넌트. 뜻이 갈린다:
// `Breadcrumb` 는 위치(계층 · 딥링크에서도 동작) · `BackLink` 는 히스토리(어디서 왔는가).
// 규격(색·크기·44px 히트 영역)은 `page-nav-style.ts` 한 곳에서 나온다 — 두 컴포넌트가 `Page` 의
// **같은 자리**에 번갈아 나타나므로 리터럴이 갈리면 화면마다 그 줄이 들썩인다.
//
// ⚠️ **`DateCalendar` 처럼 배럴에서 빼는 안을 실제로 재 보고 기각했다**(2026-08-30). 그쪽은 배럴
// 재수출이 lazy 청크를 초기 청크로 끌어오는 사례지만, 여기서는 **직접 import 가 두 지표 다 나빴다.**
// 세 변형 모두 같은 시점에 `rm -rf dist` 후 빌드해 잰 값이다(⚠️ dist 를 비우지 않으면 지난 빌드의
// 해시 청크가 남아 합계가 수백 B 씩 흔들린다 — 실제로 한 번 그 값에 속았다):
//
//                     최대 단일 청크(gzip)      JS 합계(gzip)     JS 파일 수
//   그 시점 기준선        96,985 B              180,571 B          30
//   배럴 export(현행)     98,509 B              180,654 B          31
//   직접 import          98,741 B              180,914 B          31   ← 둘 다 더 크다
//
// (커밋 시점 기준 절대값은 `scripts/check-bundle-budget.mjs` 의 D25 항목에 있다 — 그 사이 HEAD 가
// 움직여 기준선이 바뀌었다. 위 표가 고정하는 것은 **세 변형의 상대 순서**다.)
//
// 초기 청크 증가분은 배럴 탓이 아니라 **Rollup 의 공용 청크 재분할** 때문이다 — 종전에 따로 떨어져
// 있던 `client` 청크(2.11 kB gzip)가 `index` 안으로 흡수됐다(빌드 산출 목록 대조로 확인 — 그 청크가
// 목록에서 통째로 사라진다). 그 청크는 `index.js` 의 **정적 import** 라 원래도 초기 로드 경로에
// 있었고 `dist/index.html` 에 modulepreload 도 없어(확인함) 왕복이 한 번 더 붙어 있었다 — 흡수된
// 지금 사용자가 실제로 기다리는 바이트는 100.24 kB → 99.93 kB 로 오히려 **줄었고 요청도 하나
// 줄었다**(ADR 0005 의 `defaultPreload` 주석이 지적한 그 직렬화 왕복이다). 지표 하나만 보고 배럴을
// 깨뜨리면 API 만 불규칙해지고 얻는 것이 없다.
export { BackLink } from "./BackLink";
export { Breadcrumb, type BreadcrumbAncestor, type BreadcrumbProps, type BreadcrumbTarget } from "./Breadcrumb";
// 웨딩 카테고리 배지 색 (D17) — 비용 관리(entities/payment)와 리포트(pages/report)가 같은 매핑을
// 써야 하는데 entities 끼리는 서로를 import 할 수 없다. 공유 지점은 여기뿐이다(SourceList 와 같은 이유).
export { CATEGORY_BADGE_CLASS, categoryBadgeClass } from "./category-badge";
// 브랜드 락업 (D15) — 셸(사이드바·모바일 상단바)과 셸 밖 화면(로그인·온보딩·생성 오버레이)이 함께 쓴다.
export { Brand, type BrandProps } from "./Brand";
export { Button, type ButtonProps, type ButtonVariant } from "./Button";
export { Card, type CardProps } from "./Card";
// 되돌릴 수 없는 행동의 확인 다이얼로그 — 지금은 "AI 다시 생성"(entities/personalization)이
// 유일한 호출부지만, 삭제류 행동이 늘면 같은 자리로 온다.
export { ConfirmDialog, type ConfirmDialogProps } from "./ConfirmDialog";
// 날짜 입력 (D20) — `<input type="date">` 를 대체한다. 그리드(`DateCalendar`)는 이 컴포넌트가
// `React.lazy` 로 감싼 별도 청크라 여기서 함께 내보내지 않는다 — 내보내면 정적 참조가 생겨
// 초기 청크로 끌려온다(그 파일 머리말 §번들).
export { DateField, type DateFieldProps } from "./DateField";
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
// 모바일 고정바 예약 높이 (D19 동반 수정, 2026-08-29) — `AppShell`(app)과 `Page`(shared)가 **같은
// 산술**을 써야 하는데 `shared` 는 `app` 을 볼 수 없다. 값이 갈리면 노치 아이폰에서 콘텐츠가
// 고정바 밑으로 잘린다(실제로 잘리고 있었다 — 그 파일 머리말 §산술).
export { SHELL_BOTTOM_INSET, SHELL_FILL_HEIGHT, SHELL_TOP_INSET } from "./shell-metrics";
// 드롭다운 (D22) — 네이티브 `<select>` 를 감싼다. **보이는 라벨의 크기와 컨트롤의 `font-size` 가
// 다른 값**이라는 것이 이 컴포넌트의 존재 이유다(그 파일 머리말). 11개 호출부가 서로 다른 클래스
// 문자열 5종으로 갈라져 있던 것을 한 소유자로 모았다.
export { Select, type SelectOption, type SelectProps } from "./Select";
export { SkeletonRows, type SkeletonRowsProps, type SkeletonRowsVariant } from "./Skeleton";
// 근거·출처 목록 (D16) — 채팅 인용 · 체크리스트 근거 · 업체사례 관련 사례가 같은 그릇을 쓴다.
// entities 끼리는 서로를 import 할 수 없으므로 공유 지점은 여기뿐이다(safe-url·source-tier 와 같은 이유).
// AI 생성물 고지(2026-08-30) — AI상담·체크리스트·타임라인 세 화면이 같은 문구를 써야 하는데
// pages 끼리는 서로 import 할 수 없다. 공유 지점은 여기뿐이다(SourceList 와 같은 이유).
export {
  AI_CHAT_DISCLAIMER,
  AI_PLAN_DISCLAIMER,
  AiDisclaimer,
  type AiDisclaimerProps,
} from "./AiDisclaimer";
export { SourceList, type SourceListItem, type SourceListProps } from "./SourceList";
export { StatusCallout, type StatusCalloutProps } from "./StatusCallout";
// 켜고 끄는 스위치 — 온보딩 7단계에서 뽑아 올렸다(2026-08-29). 예산 재배분의 「카테고리 사용
// 여부」 패널이 같은 토글을 써야 하는데 pages 슬라이스끼리는 서로 import 할 수 없다.
export { Switch, type SwitchProps } from "./Switch";
export { Tabs, type TabsRootProps } from "./Tabs";
export {
  IconArchive,
  IconCalendar,
  IconCamera,
  IconChart,
  IconChat,
  IconCheck,
  IconChevronDown,
  IconGoogle,
  IconHome,
  IconInfo,
  IconNaver,
  IconSettings,
  IconThumbDown,
  IconThumbUp,
  IconWallet,
  type IconProps,
  type ThumbIconProps,
} from "./icons";
