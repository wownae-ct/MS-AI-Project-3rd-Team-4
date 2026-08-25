// 카테고리 상세 — 시각 스펙: docs/mockups/s3-category-detail.html
//
// 이 컴포넌트는 **라우터를 모른다.** `categoryCode` 는 라우트가 props 로 내려 준다
// (app → pages 하향 import 만 허용 — docs/architecture/layers.md).
//
// 탭 3개를 여기서 조립하는 이유 — AI상담 세션 id 를 이 레벨에서 들고 있어야 탭을 오가도
// (Tabs.Panel 이 비활성 탭을 언마운트하더라도) 세션을 잃지 않는다(ChatPanel.tsx 머리말 참조).
import { useEffect, useState } from "react";
import { ChatPanel } from "@/entities/chat";
import { ReportButton } from "@/entities/feedback";
import { getCategories, type CategoryConstant } from "@/entities/wedding";
import { Page, Tabs } from "@/shared/ui";
import { ChecklistTab } from "./ChecklistTab";
import { CostTab } from "./CostTab";

export interface CategoryPageProps {
  categoryCode: string;
}

export function CategoryPage({ categoryCode }: CategoryPageProps) {
  const [categories, setCategories] = useState<CategoryConstant[] | null>(null);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);

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

  // 탭을 바꿔도 다시 fetch 하지 않도록 세션 id 를 부모 레벨에 고정 — chatSessionId 를 매번
  // 새로 만들지 않는다(ChatPanel 머리말 참조).
  const categoryMeta = categories?.find((c) => c.code === categoryCode);

  return (
    <Page title={categoryMeta?.name_ko ?? categoryCode} subtitle="체크리스트 · 비용 · 상담을 한 곳에서 봅니다.">
      <Tabs.Root defaultValue="checklist">
        <Tabs.List label="카테고리 상세 탭">
          <Tabs.Tab value="checklist">체크리스트</Tabs.Tab>
          <Tabs.Tab value="cost">비용</Tabs.Tab>
          <Tabs.Tab value="chat">AI상담</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="checklist">
          <ChecklistTab categoryCode={categoryCode} categoryMeta={categoryMeta} />
        </Tabs.Panel>
        <Tabs.Panel value="cost">
          <CostTab categoryCode={categoryCode} categoryMeta={categoryMeta} />
        </Tabs.Panel>
        <Tabs.Panel value="chat">
          <ChatPanel
            categoryCode={categoryCode}
            sessionId={chatSessionId}
            onSessionCreated={setChatSessionId}
            renderReportAction={(messageId) => <ReportButton targetType="CHAT_MESSAGE" targetId={messageId} />}
          />
        </Tabs.Panel>
      </Tabs.Root>
    </Page>
  );
}
