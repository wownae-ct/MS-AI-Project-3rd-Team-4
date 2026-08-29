// "업체 사례" 카드 — ChecklistTab.tsx에서 뽑아냈다(oxlint import/max-dependencies 10개 제한,
// ChecklistItemRow.tsx와 같은 이유 — 관련 사례 근거 배지 추가로 새 import 2개가 필요해졌다).
//
// **관련 공식 분쟁조정 사례(DS2_KCA) 링크(2026-08-26, backend PR #86)** — 팀이 재구성한 카드
// (vendor_case_examples)와 실제 공식 사례가 분리돼 있어 카드의 신뢰도를 검증할 방법이 없었다.
// `VendorCase.related_cases`(각 카드가 개별로 가짐, chunk_id/title/source_tier/source_url —
// entities/chat의 ChatCitation과 같은 모양)를 `MessageBubble.tsx`의 인용과 같은 클릭-펼침 패턴으로
// 보여준다. 관련 사례가 없으면 빈 배열이고, 그 카드엔 이 줄 자체가 안 뜬다(지어내지 않는다).
//
// **[2026-08-29 개편 — D16]** 관련 사례를 배지 나열에서 `SourceList`(접힘 요약 + 세로 목록)로
// 옮겼다. 종전엔 max-w-[220px] truncate 알약이 가로로 늘어서 제목이 항상 잘렸다 — 펼침 상태를
// 이 컴포넌트가 Set으로 들고 있던 것도 SourceList 안으로 들어갔다(카드마다 자기 목록을 갖는다).
import type { VendorCase, VendorCasesResponse } from "@/entities/vendor-case";
import { Badge, Card, SourceList } from "@/shared/ui";

// 조립하지 않고 완성된 리터럴 둘 중 하나를 고른다 — Tailwind 스캐너는 소스를 평문으로 읽어
// 런타임 조립을 찾지 못한다(Card.tsx와 같은 처리). GOOD 은 success 색(D12, decisions.md — 업체
// 사례 배지 한 곳에 한해 D6을 좁게 뒤집은 예외), BAD 는 Badge 기본값(undefined)을 그대로 쓴다.
// **색은 `tone`, 여백은 `className`** 으로 나눠 넘긴다 — 색을 className 으로 넘기면 기준 색과
// 명시도가 같아 산출 CSS 순서에 질 수 있다(Badge.tsx 머리말의 실측). 이 배지는 `success` 가
// 알파벳 순으로 `primary` 뒤라 우연히 살아 있었을 뿐이다.
// mt-0.5 는 text-xs 배지를 text-sm 제목의 첫 줄에 광학적으로 맞추는 값 — items-start 로 바꾸면서
// 필요해졌다(제목이 두 줄이 될 수 있어 items-center 를 쓸 수 없다).
const CASE_BADGE_SPACING = "mt-0.5";
const CASE_BADGE_GOOD_TONE = "bg-success-soft text-success";

export function VendorCaseSection({ response }: { response: VendorCasesResponse }) {
  return (
    <Card title="업체 사례">
      {/* PRD RQ-F10-02 — 이 문구는 응답이 항상 포함하며 생략 없이 그대로 렌더해야 한다.
          하드코딩하지 않고 API 응답을 그대로 쓰는 이유: 문구가 바뀌어도 프론트가 뒤따라가지 않게. */}
      <p className="mb-3 text-xs text-ink-soft">{response.disclaimer}</p>
      <ul className="flex flex-col gap-2">
        {response.cases.map((c: VendorCase) => (
          <li key={c.id} className="flex flex-col gap-1 rounded-md border border-line p-3">
            {/* min-w-0 이 짝이다 — 배지가 안 눌리는 만큼(Badge.tsx 계약) 압력을 제목이 받아야
                한다. 종전엔 둘 다 아무 제약이 없어 긴 case_label 이 배지를 1글자 폭까지 눌러
                캡슐 모양을 뭉갰다(사용자 리포트 2026-08-29, 이 화면이 가장 심했다). */}
            <div className="flex items-start gap-2">
              <Badge className={CASE_BADGE_SPACING} tone={c.case_type === "GOOD" ? CASE_BADGE_GOOD_TONE : undefined}>
                {c.case_type === "GOOD" ? "잘한 사례" : "주의할 사례"}
              </Badge>
              <p className="min-w-0 text-sm font-bold text-ink">{c.case_label}</p>
            </div>
            <p className="text-xs text-ink-soft">{c.situation}</p>
            <p className="text-xs font-bold text-ink">{c.key_lesson}</p>

            {c.related_cases.length > 0 && (
              <div className="mt-1">
                <SourceList
                  noun="관련 분쟁사례"
                  items={c.related_cases.map((rc) => ({
                    key: rc.chunk_id,
                    tier: rc.source_tier,
                    title: rc.title,
                    url: rc.source_url,
                  }))}
                  // source_url이 null — 팀 자체 저작이 아니라 DS2_KCA 원문이라 사실상 항상 값이
                  // 있겠지만, 스키마상 nullable인 이상 안내를 남긴다. 자료의 출처가 달라
                  // SourceList 기본 문구("팀에서 직접 정리한…")를 쓸 수 없다.
                  noUrlNote="원문 링크가 없는 자료예요."
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
