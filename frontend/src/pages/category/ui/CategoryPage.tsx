// 카테고리 상세 — 시각 스펙: docs/mockups/s3-category-detail.html
//
// 이 컴포넌트는 **라우터를 모른다.** `categoryCode` 는 라우트가 props 로 내려 준다
// (app → pages 하향 import 만 허용 — docs/architecture/layers.md).
//
// 탭 2개(체크리스트·비용)만 보여준다 — 카테고리별 AI상담 탭은 2026-08-26 사용자 지시로 뺐다.
// AI상담 자체는 없어지지 않았다 — 탭바의 별도 `/chat`(ChatPage, 카테고리 선택형)이 그대로 있다
// (router.tsx). 이 화면에 있던 임베디드 버전만 중복이라 걷어낸다.
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { getCategories, getWeddingCategories, type CategoryConstant } from "@/entities/wedding";
import { Card, Page, Tabs } from "@/shared/ui";
import { ChecklistTab } from "./ChecklistTab";
import { CostTab } from "./CostTab";

export interface CategoryPageProps {
  categoryCode: string;
}

// 상수를 아직 못 받았을 때 쓰는 제목. **백엔드 코드값(VENUE 등)을 그대로 내보내지 않는다** —
// 조회는 보통 1~2초 안에 끝나므로 그 사이 사용자에게 내부 식별자를 보여줄 이유가 없다(D14 S9).
const GENERIC_TITLE = "카테고리";

// 「사용 안 함」 안내 화면의 링크. 셸 안 화면이라 `Link` 로 라우팅한다(전체 새로고침 방지).
const HOME_LINK = "min-h-tap inline-flex items-center text-sm font-bold text-primary underline";

export function CategoryPage({ categoryCode }: CategoryPageProps) {
  const [categories, setCategories] = useState<CategoryConstant[] | null>(null);
  // 이 웨딩에서 **꺼 둔** 카테고리인가. `GET /categories`(전역 상수)엔 `is_active` 가 없어
  // `GET /wedding-categories` 를 함께 본다.
  //
  // 🚨 **fail-open 이다 — 「행이 있고 그 `is_active` 가 false 일 때」만 참으로 둔다.** 조회
  // 실패·행 없음을 비활성으로 취급하면, 사라진 코드로 들어온 딥링크(아래 `settled` 폴백이
  // 다루는 그 경우)와 네트워크 실패가 전부 "사용 안 함" 안내로 둔갑한다. `app/App.test.tsx` 가
  // 라우트 파라미터 전달을 확인할 때 정확히 그 "목록에 없음" 경로를 탄다.
  const [isDeactivated, setIsDeactivated] = useState(false);
  // 조회가 **끝났는가**(성공·실패 무관). `categories === null` 하나로는 부족하다 — 이름을 못 찾는
  // 경우가 셋이나 되고(아직 안 옴 · 왔는데 목록에 없음 · 실패) 제목을 첫째와 나머지에서 다르게
  // 내야 하기 때문이다. "왔는데 목록에 없음"은 지어낸 경우가 아니다: 사라진 카테고리 코드로
  // 딥링크가 들어오면 그대로 발생한다.
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // allSettled — 두 조회는 서로 독립이다. 한쪽 실패가 다른 쪽 결과까지 버리면 이 파일이
    // 이미 지키는 "조회 실패해도 탭은 계속 렌더한다" 관례가 깨진다.
    Promise.allSettled([getCategories(), getWeddingCategories()])
      .then(([constants, weddingCategories]) => {
        if (cancelled) return;
        // 상수 조회 실패는 FOCUS 분기를 못 하게 할 뿐 — 탭 자체는 계속 렌더한다(각 탭이
        // categoryMeta undefined 를 "비-FOCUS" 처럼 안전하게 다룬다).
        if (constants.status === "fulfilled") setCategories(constants.value.categories);
        if (weddingCategories.status === "fulfilled") {
          const row = weddingCategories.value.categories.find((c) => c.category_code === categoryCode);
          setIsDeactivated(row !== undefined && !row.is_active);
        }
        setSettled(true);
      });
    return () => {
      cancelled = true;
    };
  }, [categoryCode]);

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

  // 대시보드의 카테고리 행은 활성만 링크로 내므로 여기 도달하는 길은 북마크·뒤로가기·주소 직접
  // 입력뿐이다. 그래도 탭을 그대로 그리면 **정상 화면 모양의 빈 체크리스트**가 되어(개인화가
  // 애초에 이 카테고리 항목을 만들지 않는다) "아직 안 온 건가"와 구분되지 않는다. 탭을 아예
  // 렌더하지 않으므로 체크리스트·업체사례·납부 내역 조회도 나가지 않는다.
  if (isDeactivated) {
    return (
      <Page title={title}>
        <Card>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-bold text-ink">사용 안 함으로 설정한 카테고리예요.</p>
            <p className="text-sm text-ink-soft">
              예산 화면의 「카테고리별 예산 현황」에서 다시 켜면 체크리스트와 타임라인이 함께 만들어져요.
            </p>
            <Link to="/" className={HOME_LINK}>
              대시보드로 돌아가기
            </Link>
          </div>
        </Card>
      </Page>
    );
  }

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
