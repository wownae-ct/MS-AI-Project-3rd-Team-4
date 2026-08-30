// 디자인 시스템 라이브 문서.
//
// 이 화면이 있는 이유는 셋이다.
//   1. 눈으로 검증한다 — 토큰·프리미티브·반응형·포커스 링이 실제로 의도대로 나오는지.
//   2. 테스트 대상이 된다 — 제품 화면이 없는 동안에도 게이트가 도는 실체가 필요하다.
//   3. 화면을 지을 때 보는 참조 문서다.
//
// 값의 SSOT 는 디자인 문서이고 여기는 그 표시일 뿐이다. 여기서 새 값을 만들지 않는다.
// 섹션을 파일로 나눈 이유는 카탈로그가 계속 늘어나기 때문이다 — 한 파일에 모으면 곧 읽을 수 없어진다.
import { BackLink, Page } from "@/shared/ui";
import { ColorSection, TypographySection } from "./sections/FoundationSection";
import {
  BadgeSection,
  ButtonSection,
  LoadingSection,
  MoneySection,
  ProgressSection,
  TabsSection,
} from "./sections/ComponentsSection";
import { DateFieldSection, SelectSection } from "./sections/FormsSection";
import { FocusSection, NonGoalsSection, ShapeSection, SurfaceSection } from "./sections/SystemSection";

export function StyleGuidePage() {
  return (
    // 설정과 같은 성격의 화면이다 (D25) — 데스크톱 사이드바 보조 메뉴에서만 들어오고 부모가 없다.
    // 참조 화면이라 「보다가 원래 하던 일로 돌아간다」가 유일한 나가는 동선이다.
    <Page
      title="디자인 시스템"
      subtitle="디자인 문서의 구현체입니다. 값의 출처는 이 화면이 아니라 그 문서입니다."
      nav={<BackLink />}
    >
      <ColorSection />
      <TypographySection />
      <ShapeSection />
      <MoneySection />
      <ButtonSection />
      <BadgeSection />
      <ProgressSection />
      {/* 진행률 바로 아래 둔다 — 둘의 경계(값이 있는 진행 vs 조회 대기)가 가장 헷갈리는 자리라
          나란히 보여야 구분이 선다(D14). */}
      <LoadingSection />
      {/* 타이포 절 바로 옆이 아니라 여기 둔다 — 드롭다운의 요점은 스케일 자체가 아니라 **폼
          컨트롤에서 그 스케일이 어떻게 갈리는가**라, 같은 성격인 날짜 입력과 나란히 서야 읽힌다(D22). */}
      <SelectSection />
      <DateFieldSection />
      <TabsSection />
      <SurfaceSection />
      <FocusSection />
      <NonGoalsSection />
    </Page>
  );
}
