// 타임라인 — 시각 스펙: docs/mockups/s4-timeline.html
//
// D-12개월부터 결혼식 당일까지 세로 리스트, phase 라벨(D-12개월/D-9개월/...)로 그룹핑.
// phase 라벨은 저장 컬럼이 아니라 프론트가 공식으로 계산한다 — 근거와 공식은 `group-by-phase.ts`
// 머리말 참고. 비활성 카테고리 항목은 서버가 이미 응답에서 뺀다(`03_API_spec.md` #15 — 이
// 화면에서 따로 필터링하지 않는다).
//
// `GET /timeline-items`와 `GET /weddings/me`를 병렬로 불러온다 — 후자는 phase 계산의 기준일
// (wedding_date)을 얻기 위해서고, 카테고리 라벨은 항목의 category_code를 그대로 보여준다
// (이 응답엔 카테고리 이름이 없고, 이름 하나 때문에 세 번째 호출을 추가하지 않는다 — YAGNI).
import { useEffect, useState } from "react";
import { getTimelineItems, type TimelineItem } from "@/entities/timeline";
import { getMyWedding } from "@/entities/wedding";
import { RegenerateButton } from "@/entities/personalization";
import { ApiError } from "@/shared/api";
import { Card, Page } from "@/shared/ui";
import { AddTimelineItemRow } from "./AddTimelineItemRow";
import { groupTimelineItemsByPhase } from "./group-by-phase";
import { TimelineItemRow } from "./TimelineItemRow";

interface TimelineData {
  items: TimelineItem[];
  weddingDate: string | undefined;
}

export function TimelinePage() {
  const [data, setData] = useState<TimelineData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getTimelineItems(), getMyWedding()])
      .then(([itemsResponse, wedding]) => {
        if (!cancelled) setData({ items: itemsResponse.items, weddingDate: wedding.wedding_date });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "타임라인을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleItemChange(updated: TimelineItem) {
    setData((prev) => (prev ? { ...prev, items: prev.items.map((item) => (item.id === updated.id ? updated : item)) } : prev));
  }

  // 커스텀 항목 추가·수동 재생성 뒤 목록을 다시 받아온다 — 둘 다 서버가 항목을 새로 만들거나
  // 대체하는 동작이라 낙관적 갱신 대신 재조회가 맞다.
  function refetchItems() {
    getTimelineItems()
      .then((res) => setData((prev) => (prev ? { ...prev, items: res.items } : prev)))
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : "타임라인을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      });
  }

  if (error !== null) {
    return (
      <Page title="타임라인" subtitle="D-12개월부터 결혼식 당일까지, 비활성 카테고리는 제외됩니다">
        <p role="alert" className="rounded-md border border-line bg-primary-soft px-3 py-2 text-sm text-primary">
          {error}
        </p>
      </Page>
    );
  }

  if (data === null) {
    return (
      <Page title="타임라인" subtitle="D-12개월부터 결혼식 당일까지, 비활성 카테고리는 제외됩니다">
        <p className="text-sm text-ink-soft">불러오는 중…</p>
      </Page>
    );
  }

  const groups = groupTimelineItemsByPhase(data.items, data.weddingDate);

  return (
    <Page title="타임라인" subtitle="D-12개월부터 결혼식 당일까지, 비활성 카테고리는 제외됩니다">
      <div className="flex flex-col gap-5">
        <div className="flex justify-end">
          <RegenerateButton domain="TIMELINE" label="AI 타임라인 다시 생성" onRegenerated={refetchItems} />
        </div>
        {/* 목업(s4-timeline.html:80)은 구간 헤더에 라벨과 날짜를 함께 보여준다 — 라벨만으로는
            "12개월 전이 정확히 언제인지" 알 수 없다. 날짜가 없는 유일한 경우("일정 미정" 그룹)는
            그냥 라벨만 낸다. */}
        {groups.map((group) => (
          <Card key={group.label} title={group.date ? `${group.label} · ${group.date}` : group.label}>
            <div className="flex flex-col">
              {group.items.map((item) => (
                <TimelineItemRow key={item.id} item={item} categoryLabel={item.category_code} onStatusChange={handleItemChange} />
              ))}
            </div>
          </Card>
        ))}

        <AddTimelineItemRow onAdded={refetchItems} />
      </div>
    </Page>
  );
}
