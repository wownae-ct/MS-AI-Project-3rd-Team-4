// 타임라인 — 시각 스펙: docs/mockups/s4-timeline.html
//
// D-12개월부터 결혼식 당일까지 세로 리스트, phase 라벨(D-12개월/D-9개월/...)로 그룹핑.
// phase 라벨은 저장 컬럼이 아니라 프론트가 공식으로 계산한다 — 근거와 공식은 `group-by-phase.ts`
// 머리말 참고. 비활성 카테고리 항목은 서버가 이미 응답에서 뺀다(`03_API_spec.md` #15 — 이
// 화면에서 따로 필터링하지 않는다).
//
// `GET /timeline-items`·`GET /weddings/me`·`GET /categories`를 병렬로 불러온다 — 웨딩은 phase
// 계산의 기준일(wedding_date)을 얻기 위해서고, 카테고리는 라벨(name_ko) 매핑을 위해서다.
// STEP 10 — 예전엔 "이름 하나 때문에 세 번째 호출을 추가하지 않는다"(YAGNI)며 item.category_code를
// 그대로 보여줬는데, 그 결과 화면에 "VENUE" 같은 원시 ENUM 코드가 그대로 노출됐다. GET /categories는
// 활성/비활성 전체 9개를 돌려주므로(비활성 카테고리 소속 잔존 항목도 라벨이 있어야 함) 활성만
// 거르지 않고 그대로 맵으로 쓴다.
import { useEffect, useRef, useState } from "react";
import { getTimelineItems, type TimelineItem } from "@/entities/timeline";
import { getCategories, getMyWedding } from "@/entities/wedding";
import { RegenerateButton } from "@/entities/personalization";
import { ApiError } from "@/shared/api";
import { Card, Page } from "@/shared/ui";
import { AddTimelineItemRow } from "./AddTimelineItemRow";
import { groupTimelineItemsByPhase, type TimelinePhaseGroup } from "./group-by-phase";
import { TimelineItemRow } from "./TimelineItemRow";

interface TimelineData {
  items: TimelineItem[];
  weddingDate: string | undefined;
  categoryLabelByCode: Map<string, string>;
}

// STEP 8 — "D-12개월부터"를 고정 문구로 박아뒀었는데, 실제 최상단 구간은 LLM이 생성한 카탈로그의
// 최대 offset이나 완료 구간 재배치(그룹 전체가 DONE이면 아래로 내려감)에 따라 달라질 수 있어
// 부제와 화면이 어긋났다. 실제로 화면 맨 위에 렌더되는 첫 그룹(groups[0])의 라벨에서 동적으로
// 만든다 — 그래야 카탈로그가 바뀌거나 구간이 재배치돼도 항상 일치한다.
const GENERIC_TIMELINE_SUBTITLE = "비활성 카테고리는 제외됩니다";

export function timelineSubtitle(groups: TimelinePhaseGroup[]): string {
  const topLabel = groups[0]?.label;
  if (topLabel === undefined || topLabel === "일정 미정") return GENERIC_TIMELINE_SUBTITLE;
  return `${topLabel}부터 결혼식 당일까지, ${GENERIC_TIMELINE_SUBTITLE}`;
}

/** STEP 10 — 맵에 없는 코드(카테고리 목록 조회 실패 등)는 원시 코드로라도 폴백해 최소한
 * 화면이 빈칸이 되진 않게 한다. */
export function resolveCategoryLabel(categoryCode: string | null, categoryLabelByCode: Map<string, string>): string | null {
  if (categoryCode === null) return null;
  return categoryLabelByCode.get(categoryCode) ?? categoryCode;
}

export function TimelinePage() {
  const [data, setData] = useState<TimelineData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getTimelineItems(), getMyWedding(), getCategories()])
      .then(([itemsResponse, wedding, categoriesResponse]) => {
        if (cancelled) return;
        setData({
          items: itemsResponse.items,
          weddingDate: wedding.wedding_date,
          categoryLabelByCode: new Map(categoriesResponse.categories.map((c) => [c.code, c.name_ko])),
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "타임라인을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 완료 토글 announce — 체크박스는 네이티브라 체크 자체는 스크린리더가 읽지만, 그 직후
  // group-by-phase.ts의 완료 구간 재배치(sortDoneLast + pending/done 그룹 분리)가 같은 렌더
  // 사이클에 일어나 방금 만진 행이 화면에서 자리를 옮길 수 있다 — 최소한 "무엇이 어떻게
  // 바뀌었는지"는 announce한다(접근성 감사 2026-08-26, WCAG 4.1.3).
  const [announcement, setAnnouncement] = useState("");

  function handleItemChange(updated: TimelineItem) {
    setData((prev) => (prev ? { ...prev, items: prev.items.map((item) => (item.id === updated.id ? updated : item)) } : prev));
    setAnnouncement(updated.status === "DONE" ? `${updated.title} 완료로 표시했어요.` : `${updated.title} 완료를 해제했어요.`);
  }

  // 커스텀 항목 추가·수동 재생성 뒤 목록을 다시 받아온다 — 둘 다 서버가 항목을 새로 만들거나
  // 대체하는 동작이라 낙관적 갱신 대신 재조회가 맞다. 항목 추가 직후 곧바로 "다시 생성"을 누르는
  // 것처럼 두 호출이 겹치면 응답이 보낸 순서와 다르게 도착할 수 있다 — 시퀀스 번호로 "가장
  // 최근에 보낸 재조회"일 때만 결과를 반영해, 늦게 도착한 예전 응답이 최신 타임라인을 덮어쓰지
  // 않게 막는다(레드팀 감사).
  const refetchSeqRef = useRef(0);
  function refetchItems() {
    const seq = ++refetchSeqRef.current;
    getTimelineItems()
      .then((res) => {
        if (refetchSeqRef.current !== seq) return;
        setData((prev) => (prev ? { ...prev, items: res.items } : prev));
      })
      .catch((err: unknown) => {
        if (refetchSeqRef.current !== seq) return;
        setError(err instanceof ApiError ? err.message : "타임라인을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      });
  }

  if (error !== null) {
    return (
      <Page title="타임라인" subtitle={GENERIC_TIMELINE_SUBTITLE}>
        <p role="alert" className="rounded-md border border-line bg-primary-soft px-3 py-2 text-sm text-primary">
          {error}
        </p>
      </Page>
    );
  }

  if (data === null) {
    return (
      <Page title="타임라인" subtitle={GENERIC_TIMELINE_SUBTITLE}>
        <p className="text-sm text-ink-soft">불러오는 중…</p>
      </Page>
    );
  }

  const groups = groupTimelineItemsByPhase(data.items, data.weddingDate);

  return (
    <Page title="타임라인" subtitle={timelineSubtitle(groups)}>
      <output className="sr-only">{announcement}</output>
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
                <TimelineItemRow
                  key={item.id}
                  item={item}
                  categoryLabel={resolveCategoryLabel(item.category_code, data.categoryLabelByCode)}
                  onStatusChange={handleItemChange}
                />
              ))}
            </div>
          </Card>
        ))}

        <AddTimelineItemRow onAdded={refetchItems} />
      </div>
    </Page>
  );
}
