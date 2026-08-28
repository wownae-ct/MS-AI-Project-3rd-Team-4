// 카테고리 상세 — 시각 스펙: docs/mockups/s3-category-detail.html
//
// 이 컴포넌트는 **라우터를 모른다.** `categoryCode` 는 라우트가 props 로 내려 준다
// (app → pages 하향 import 만 허용 — docs/architecture/layers.md).
//
// 탭 2개(체크리스트·비용)만 보여준다 — 카테고리별 AI상담 탭은 2026-08-26 사용자 지시로 뺐다.
// AI상담 자체는 없어지지 않았다 — 탭바의 별도 `/chat`(ChatPage, 카테고리 선택형)이 그대로 있다
// (router.tsx). 이 화면에 있던 임베디드 버전만 중복이라 걷어낸다.
import { useEffect, useState } from "react";
import { getCategories, type CategoryConstant } from "@/entities/wedding";
import { Page, Tabs } from "@/shared/ui";
import { ChecklistTab } from "./ChecklistTab";
import { CostTab } from "./CostTab";

export interface CategoryPageProps {
  categoryCode: string;
}

// 상수를 아직 못 받았을 때 쓰는 제목. **백엔드 코드값(VENUE 등)을 그대로 내보내지 않는다** —
// 조회는 보통 1~2초 안에 끝나므로 그 사이 사용자에게 내부 식별자를 보여줄 이유가 없다(D14 S9).
const GENERIC_TITLE = "카테고리";

export function CategoryPage({ categoryCode }: CategoryPageProps) {
  const [categories, setCategories] = useState<CategoryConstant[] | null>(null);
  // 조회가 **끝났는가**(성공·실패 무관). `categories === null` 하나로는 부족하다 — 이름을 못 찾는
  // 경우가 셋이나 되고(아직 안 옴 · 왔는데 목록에 없음 · 실패) 제목을 첫째와 나머지에서 다르게
  // 내야 하기 때문이다. "왔는데 목록에 없음"은 지어낸 경우가 아니다: 사라진 카테고리 코드로
  // 딥링크가 들어오면 그대로 발생한다.
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCategories()
      .then((res) => {
        if (!cancelled) setCategories(res.categories);
      })
      .catch(() => {
        // 카테고리 상수 조회 실패는 FOCUS 분기를 못 하게 할 뿐 — 탭 자체는 계속 렌더한다
        // (각 탭이 categoryMeta undefined 를 "비-FOCUS" 처럼 안전하게 다룬다).
      })
      .finally(() => {
        if (!cancelled) setSettled(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const categoryMeta = categories?.find((c) => c.code === categoryCode);

  // 조회가 끝난 뒤에도 이름을 못 찾았으면 코드로 폴백한다 — 이름을 영영 못 받는 상황에서 일반
  // 제목만 남으면 사용자가 **어느 카테고리를 보고 있는지 알 수 없다.** 그때는 내부 코드라도
  // 있는 편이 낫다. 반대로 **조회 중에는 코드를 내보내지 않는다** — 1~2초 뒤에 이름이 올 것을
  // 알면서 내부 식별자를 먼저 보여줄 이유가 없다(D14 S9).
  //
  // ⚠️ 이 폴백은 app/App.test.tsx 가 "`$id` 가 라우트에 전달되고 대문자로 되돌려졌다"를 확인하는
  // 근거이기도 하다 — 그 테스트는 getCategories 를 **빈 목록으로 성공** 목킹하므로 "왔는데 목록에
  // 없음" 경로를 탄다. 이 줄을 고칠 때 그 테스트를 함께 본다.
  const title = categoryMeta?.name_ko ?? (settled ? categoryCode : GENERIC_TITLE);

  return (
    <Page title={title} subtitle="체크리스트 · 비용을 한 곳에서 봅니다.">
      <Tabs.Root defaultValue="checklist">
        <Tabs.List label="카테고리 상세 탭">
          <Tabs.Tab value="checklist">체크리스트</Tabs.Tab>
          <Tabs.Tab value="cost">비용</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="checklist">
          <ChecklistTab categoryCode={categoryCode} categoryMeta={categoryMeta} />
        </Tabs.Panel>
        <Tabs.Panel value="cost">
          <CostTab categoryCode={categoryCode} categoryMeta={categoryMeta} />
        </Tabs.Panel>
      </Tabs.Root>
    </Page>
  );
}
