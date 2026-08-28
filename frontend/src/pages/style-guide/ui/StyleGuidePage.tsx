// 디자인 시스템 라이브 문서.
//
// 이 화면이 있는 이유는 셋이다.
//   1. 눈으로 검증한다 — 토큰·프리미티브·반응형·포커스 링이 실제로 의도대로 나오는지.
//   2. 테스트 대상이 된다 — 제품 화면이 없는 동안에도 게이트가 도는 실체가 필요하다.
//   3. 화면을 지을 때 보는 참조 문서다.
//
// 값의 SSOT 는 디자인 문서이고 여기는 그 표시일 뿐이다. 여기서 새 값을 만들지 않는다.
// 섹션을 파일로 나눈 이유는 카탈로그가 계속 늘어나기 때문이다 — 한 파일에 모으면 곧 읽을 수 없어진다.
import { Page } from "@/shared/ui";
import { ColorSection, TypographySection } from "./sections/FoundationSection";
import {
  BadgeSection,
  ButtonSection,
  MoneySection,
  ProgressSection,
  TabsSection,
} from "./sections/ComponentsSection";
import { FocusSection, NonGoalsSection, ShapeSection, SurfaceSection } from "./sections/SystemSection";

export function StyleGuidePage() {
  return (
    <Page
      title="디자인 시스템"
      subtitle="디자인 문서의 구현체입니다. 값의 출처는 이 화면이 아니라 그 문서입니다."
    >
      <ColorSection />
      <TypographySection />
      <ShapeSection />
      <MoneySection />
      <ButtonSection />
      <BadgeSection />
      <ProgressSection />
      <TabsSection />
      <SurfaceSection />
      <FocusSection />
      <NonGoalsSection />
    </Page>
  );
}
