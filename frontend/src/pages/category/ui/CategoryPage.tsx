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

export function CategoryPage({ categoryCode }: CategoryPageProps) {
  const [categories, setCategories] = useState<CategoryConstant[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCategories()
      .then((res) => {
        if (!cancelled) setCategories(res.categories);
      })
      .catch(() => {
        // 카테고리 상수 조회 실패는 FOCUS 분기를 못 하게 할 뿐 — 탭 자체는 계속 렌더한다
        // (각 탭이 categoryMeta undefined 를 "비-FOCUS" 처럼 안전하게 다룬다).
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const categoryMeta = categories?.find((c) => c.code === categoryCode);

  return (
    <Page title={categoryMeta?.name_ko ?? categoryCode} subtitle="체크리스트 · 비용을 한 곳에서 봅니다.">
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
