"""체크리스트 개인화 라우터 에이전트 비상 폴백 카탈로그 — 13_personalization_router_agent_design.md
§2. VENUE/SDM은 docs/wedding/ing/ds6-checklist-seed-data-prep.md의 OFFICIAL-tier 24항목(VENUE
CONTRACT_TERM 10 + SDM CONTRACT_TERM 14) 전사, 나머지 7개 MOCKUP 카테고리(MEETING/GIFT/
HOMEWARE/INVITATION/HONEYMOON/HOMENEW/ETC)는 00_BASELINE.md §0-2 Should "MOCKUP 7개 카테고리
얇은 시드" — 5개(MEETING/GIFT/HOMEWARE/INVITATION/HONEYMOON)는 같은 문서의 CONSENSUS-tier
항목 전사, HOMENEW/ETC 2개(v3.0에 없던 v4.0 신규 카테고리라 ds6 문서에 원본이 없음)는 같은
스타일로 이 자리에서 새로 저작했다.

validate 노드가 BLOCKED를 반환했을 때만 쓰이는 최후 폴백이다. VENUE/SDM은 공정위 표준약관/
표준계약서 조문을 직접 근거로 삼은 OFFICIAL 항목만 담고, 나머지 7개 MOCKUP 카테고리는 업계 통념·
실무 관행에 기반한 CONSENSUS 항목이다(§8 "새 통계 수치 창작 금지" 원칙에 따라 구체적 수치·법령
근거를 새로 지어내지 않고 일반적인 확인·준비 사항으로만 구성).

group_label은 VENUE/SDM은 원본(ds6-checklist-seed-data-prep.md)에 필드 자체가 없어 카테고리
단위로 직접 부여했다(item_type이 전부 CONTRACT_TERM이라 item_type 기반 매핑을 쓰면 항목 전부가
같은 값 하나로 뭉개지기 때문). 나머지 7개 MOCKUP 카테고리는 item_type이 CONTRACT_TERM/
EXTRA_COST/PREP로 섞여 있어 반대로 item_type 기반 매핑(GROUP_LABEL_BY_ITEM_TYPE)이 의미 있게
구분되므로 그대로 사용한다."""

from dataclasses import dataclass

from app.schemas.common import CategoryCode

# app/services/personalization.py가 LLM 생성(SUCCESS 경로) 체크리스트 항목의 group_label을
# item_type으로부터 채울 때 쓰는 매핑. VENUE/SDM 폴백(전부 CONTRACT_TERM, 카테고리별 인라인
# group_label)에는 적용하지 않지만, 나머지 7개 MOCKUP 카테고리 폴백(item_type 혼합)은 이 매핑을
# 그대로 재사용한다.
GROUP_LABEL_BY_ITEM_TYPE: dict[str, str] = {
    "CONTRACT_TERM": "계약 조항 확인",
    "EXTRA_COST": "추가 비용 확인",
    "PREP": "준비 사항",
}

_FTC_VENUE_URL = "https://www.ftc.go.kr/www/selectBbsNttView.do?key=202&bordCd=201&nttSn=11187"
_FTC_AGENCY_URL = "https://www.ftc.go.kr/www/selectBbsNttView.do?key=202&bordCd=201&nttSn=45973"
_VENUE_GROUP_LABEL = "예식장 표준약관 확인"
_SDM_GROUP_LABEL = "스드메 표준계약서 확인"


@dataclass(frozen=True)
class ChecklistTemplateItem:
    category_code: CategoryCode
    item_type: str
    group_label: str
    title: str
    body: str
    source_tier: str
    source_label: str
    # OFFICIAL(VENUE/SDM)은 항상 근거 URL이 있지만 CONSENSUS(나머지 7개 MOCKUP 카테고리, 팀
    # 자체 정리)는 인용할 1차 출처 자체가 없어 None이다.
    source_url: str | None
    display_order: int


CHECKLIST_FALLBACK_CATALOG: tuple[ChecklistTemplateItem, ...] = (
    # ===== VENUE — 공정위 예식장이용 표준약관(제10030호), CONTRACT_TERM 10개 =====
    ChecklistTemplateItem(
        "VENUE",
        "CONTRACT_TERM",
        _VENUE_GROUP_LABEL,
        "계약금이 예식비용의 10%를 넘지 않는지 확인",
        "예식장이용 표준약관 제3조는 계약금을 예식비용의 10% 이하로 제한합니다. "
        "이보다 높은 계약금을 요구하면 근거를 물어보세요.",
        "OFFICIAL",
        "공정위 예식장이용 표준약관(제10030호) 제3조",
        _FTC_VENUE_URL,
        1,
    ),
    ChecklistTemplateItem(
        "VENUE",
        "CONTRACT_TERM",
        _VENUE_GROUP_LABEL,
        "계약서에 이용일시·이용호실·항목별 예식비용이 각각 적혀 있는지 확인",
        "표준약관 제2조는 이용일시, 이용호실, 부대시설·서비스·물품별 이용요금을 항목별로 "
        "계약서에 기재하도록 정합니다. 총액만 적힌 계약서는 나중에 항목별 근거를 따지기 어렵습니다.",
        "OFFICIAL",
        "공정위 예식장이용 표준약관(제10030호) 제2조",
        _FTC_VENUE_URL,
        2,
    ),
    ChecklistTemplateItem(
        "VENUE",
        "CONTRACT_TERM",
        _VENUE_GROUP_LABEL,
        "계약 해제 시 손해배상이 소비자분쟁해결기준을 따르는지 확인",
        "표준약관 제6조는 계약 해제에 따른 손해배상을 공정위 소비자분쟁해결기준에 따르도록 "
        "정합니다. 이 기준보다 과도한 위약금 조항이 별도로 붙어있지 않은지 확인하세요.",
        "OFFICIAL",
        "공정위 예식장이용 표준약관(제10030호) 제6조",
        _FTC_VENUE_URL,
        3,
    ),
    ChecklistTemplateItem(
        "VENUE",
        "CONTRACT_TERM",
        _VENUE_GROUP_LABEL,
        "예식비용 외 추가 금품을 요구하지 않는다는 조항이 있는지 확인",
        "표준약관 제4조②는 사업자가 계약에서 정한 예식비용 이외의 금품을 요구할 수 없도록 "
        "정합니다. 현장에서 예상치 못한 추가 결제를 요구받으면 이 조항을 근거로 문제를 "
        "제기할 수 있습니다.",
        "OFFICIAL",
        "공정위 예식장이용 표준약관(제10030호) 제4조",
        _FTC_VENUE_URL,
        4,
    ),
    ChecklistTemplateItem(
        "VENUE",
        "CONTRACT_TERM",
        _VENUE_GROUP_LABEL,
        "부대서비스 이용을 예식장 계약 조건으로 강제하지 않는지 확인",
        "표준약관 제4조③은 식당·드레스·화장·촬영 등 부대서비스 이용을 예식장 이용의 조건으로 "
        "걸 수 없도록 정합니다. 특정 업체 이용을 강제하면 표준약관 위반 소지가 있습니다.",
        "OFFICIAL",
        "공정위 예식장이용 표준약관(제10030호) 제4조",
        _FTC_VENUE_URL,
        5,
    ),
    ChecklistTemplateItem(
        "VENUE",
        "CONTRACT_TERM",
        _VENUE_GROUP_LABEL,
        "기념사진 훼손 시 재촬영·배상 기준이 계약서에 있는지 확인",
        "표준약관 제8조는 사업자 귀책으로 기념사진이 멸실·훼손된 경우 재촬영 또는 촬영요금 "
        "최대 3배 배상을 정합니다. 이 기준이 계약서·약관에 반영돼 있는지 확인하세요.",
        "OFFICIAL",
        "공정위 예식장이용 표준약관(제10030호) 제8조",
        _FTC_VENUE_URL,
        6,
    ),
    ChecklistTemplateItem(
        "VENUE",
        "CONTRACT_TERM",
        _VENUE_GROUP_LABEL,
        "부대시설 사업자가 다를 때 사고 책임 소재를 확인",
        "표준약관 제9조는 부대시설 사업자가 예식장과 달라도 원칙적으로 예식장에 배상을 청구할 "
        "수 있도록 정합니다. 다만 예식장이 책임을 지지 않는다고 사전 고지한 경우는 예외이니 "
        "계약서 문구를 확인하세요.",
        "OFFICIAL",
        "공정위 예식장이용 표준약관(제10030호) 제9조",
        _FTC_VENUE_URL,
        7,
    ),
    ChecklistTemplateItem(
        "VENUE",
        "CONTRACT_TERM",
        _VENUE_GROUP_LABEL,
        "휴대품 도난·분실 시 예식장의 배상 책임 범위 확인",
        "표준약관 제11조는 맡기지 않은 물건도 예식장·종업원의 고의·과실로 분실되면 배상 책임을 "
        "지도록 정합니다. 다만 고가물은 종류·가액을 미리 밝히지 않으면 배상 대상에서 제외될 "
        "수 있습니다.",
        "OFFICIAL",
        "공정위 예식장이용 표준약관(제10030호) 제11조",
        _FTC_VENUE_URL,
        8,
    ),
    ChecklistTemplateItem(
        "VENUE",
        "CONTRACT_TERM",
        _VENUE_GROUP_LABEL,
        "천재지변 등 불가항력 사유 발생 시 계약금 반환 조항 확인",
        "표준약관 제12조는 천재지변 등 불가항력으로 계약을 이행할 수 없는 경우 계약금을 "
        "반환하도록 정합니다. 이 조항이 계약서에 그대로 담겨 있는지 확인하세요.",
        "OFFICIAL",
        "공정위 예식장이용 표준약관(제10030호) 제12조",
        _FTC_VENUE_URL,
        9,
    ),
    ChecklistTemplateItem(
        "VENUE",
        "CONTRACT_TERM",
        _VENUE_GROUP_LABEL,
        "감염병 위기 상황 시 위약금 감경·면제 특칙이 반영됐는지 확인",
        "표준약관 제13조는 감염병 1급 발생·유행 시 상황별로 위약금을 40%~전액 감경하거나 "
        "계약금을 전액 환급하도록 특칙을 정합니다. 팬데믹 등 예외 상황 대비 조항이 계약서에 "
        "있는지 확인하세요.",
        "OFFICIAL",
        "공정위 예식장이용 표준약관(제10030호) 제13조",
        _FTC_VENUE_URL,
        10,
    ),
    # ===== SDM — 공정위 결혼준비대행업 표준계약서(제10082호), CONTRACT_TERM 14개 =====
    ChecklistTemplateItem(
        "SDM",
        "CONTRACT_TERM",
        _SDM_GROUP_LABEL,
        "계약서에 대행업자·제휴사업자 정보와 서비스별 요금이 각각 명시됐는지 확인",
        "결혼준비대행업 표준계약서 제3조②는 대행업자·제휴사업자의 상호·연락처와 기본서비스별 "
        "요금을 계약서에 개별 기재하도록 정합니다. 패키지 총액만 있는 계약서는 항목별 근거를 "
        "따지기 어렵습니다.",
        "OFFICIAL",
        "공정위 결혼준비대행업 표준계약서(제10082호) 제3조",
        _FTC_AGENCY_URL,
        1,
    ),
    ChecklistTemplateItem(
        "SDM",
        "CONTRACT_TERM",
        _SDM_GROUP_LABEL,
        "도우미(헬퍼) 비용 등 추가 요금 항목이 계약서에 미리 적혀 있는지 확인",
        "표준계약서 제3조②는 헬퍼 비용처럼 추가 요금이 발생하는 서비스 항목을 계약서에 미리 "
        "명시하도록 정합니다. 계약서에 없는 항목은 나중에 추가 청구되면 근거를 따질 수 있습니다.",
        "OFFICIAL",
        "공정위 결혼준비대행업 표준계약서(제10082호) 제3조",
        _FTC_AGENCY_URL,
        2,
    ),
    ChecklistTemplateItem(
        "SDM",
        "CONTRACT_TERM",
        _SDM_GROUP_LABEL,
        "계약금이 총 대행요금의 10% 이내(임박 계약은 최대 20%)인지 확인",
        "표준계약서 제6조②는 계약금을 총 대행요금의 10% 이내로 정하되, 예식이 임박한 특별한 "
        "사정이 있을 때만 합의로 최대 20%까지 허용합니다.",
        "OFFICIAL",
        "공정위 결혼준비대행업 표준계약서(제10082호) 제6조",
        _FTC_AGENCY_URL,
        3,
    ),
    ChecklistTemplateItem(
        "SDM",
        "CONTRACT_TERM",
        _SDM_GROUP_LABEL,
        "웨딩박람회 등 사업장 밖에서 계약했다면 14일 이내 청약철회가 가능함을 인지",
        "표준계약서 제4조①은 방문판매 등에 관한 법률에 따라 사업장 밖 계약 시 계약서를 받은 "
        "날부터 14일 이내 청약철회를 허용합니다.",
        "OFFICIAL",
        "공정위 결혼준비대행업 표준계약서(제10082호) 제4조",
        _FTC_AGENCY_URL,
        4,
    ),
    ChecklistTemplateItem(
        "SDM",
        "CONTRACT_TERM",
        _SDM_GROUP_LABEL,
        "온라인 계약·할부결제의 청약철회 기한(각 7일)을 확인",
        "표준계약서 제4조②③은 온라인 계약은 전자상거래법에 따라 7일, 2개월·3회 이상 할부결제는 "
        "할부거래법에 따라 7일 이내 서면 청약철회를 허용합니다.",
        "OFFICIAL",
        "공정위 결혼준비대행업 표준계약서(제10082호) 제4조",
        _FTC_AGENCY_URL,
        5,
    ),
    ChecklistTemplateItem(
        "SDM",
        "CONTRACT_TERM",
        _SDM_GROUP_LABEL,
        "청약철회 시 3영업일 이내 환급 규정이 계약서에 있는지 확인",
        "표준계약서 제4조⑥은 청약철회 의사를 통보받은 때로부터 3영업일 이내에 대행요금을 "
        "환급하도록 정합니다.",
        "OFFICIAL",
        "공정위 결혼준비대행업 표준계약서(제10082호) 제4조",
        _FTC_AGENCY_URL,
        6,
    ),
    ChecklistTemplateItem(
        "SDM",
        "CONTRACT_TERM",
        _SDM_GROUP_LABEL,
        "위약금이 표준계약서 제10조 기준을 초과하지 않는지 확인",
        "표준계약서 제3조④는 위약금이 제10조가 정한 환급·위약금 기준을 초과할 수 없도록 "
        "정합니다. 계약서의 위약금 조항을 제10조 기준과 비교해보세요.",
        "OFFICIAL",
        "공정위 결혼준비대행업 표준계약서(제10082호) 제10조",
        _FTC_AGENCY_URL,
        7,
    ),
    ChecklistTemplateItem(
        "SDM",
        "CONTRACT_TERM",
        _SDM_GROUP_LABEL,
        "'서비스 개시' 시점이 계약서에서 어떻게 정의되는지 확인",
        "표준계약서 제10조는 예식장·스튜디오 계약, 드레스 선정 등 채무이행 행위를 시작한 "
        "시점을 '서비스 개시'로 정의하며, 개시 전후로 위약금·환급 기준이 크게 달라집니다.",
        "OFFICIAL",
        "공정위 결혼준비대행업 표준계약서(제10082호) 제10조",
        _FTC_AGENCY_URL,
        8,
    ),
    ChecklistTemplateItem(
        "SDM",
        "CONTRACT_TERM",
        _SDM_GROUP_LABEL,
        "담당 플래너 교체 시 즉시 대체 배정 조항이 있는지 확인",
        "표준계약서 제7조③은 담당 플래너 교체 시 대행업자가 즉시 다른 담당 플래너를 배정해 "
        "서비스를 원활히 제공하도록 정합니다.",
        "OFFICIAL",
        "공정위 결혼준비대행업 표준계약서(제10082호) 제7조",
        _FTC_AGENCY_URL,
        9,
    ),
    ChecklistTemplateItem(
        "SDM",
        "CONTRACT_TERM",
        _SDM_GROUP_LABEL,
        "제휴업체 폐업 시 동급 대체 서비스 제공 의무가 명시됐는지 확인",
        "표준계약서 제7조⑤는 제휴사업자 폐업 등으로 서비스를 받지 못하면 대행업자가 동일하거나 "
        "준하는 서비스를 지체없이 제공하도록 정합니다.",
        "OFFICIAL",
        "공정위 결혼준비대행업 표준계약서(제10082호) 제7조",
        _FTC_AGENCY_URL,
        10,
    ),
    ChecklistTemplateItem(
        "SDM",
        "CONTRACT_TERM",
        _SDM_GROUP_LABEL,
        "제휴업체 위약금을 이용자에게 전가하는 조건·절차(사전 설명·동의)가 명시됐는지 확인",
        "표준계약서 제10조는 대행업자가 제휴업체 위약금을 이용자에게 청구하려면 선정 전 "
        "기준·범위 설명, 선정 후 별도 동의를 받도록 정합니다.",
        "OFFICIAL",
        "공정위 결혼준비대행업 표준계약서(제10082호) 제10조",
        _FTC_AGENCY_URL,
        11,
    ),
    ChecklistTemplateItem(
        "SDM",
        "CONTRACT_TERM",
        _SDM_GROUP_LABEL,
        "계약서에 없는 추가 요금을 이행 중 요구할 수 없다는 조항 확인",
        "표준계약서 제8조②는 계약서에 명시하지 않은 추가 요금 항목을 계약이행 중 요구할 수 "
        "없도록 정합니다.",
        "OFFICIAL",
        "공정위 결혼준비대행업 표준계약서(제10082호) 제8조",
        _FTC_AGENCY_URL,
        12,
    ),
    ChecklistTemplateItem(
        "SDM",
        "CONTRACT_TERM",
        _SDM_GROUP_LABEL,
        "개인정보 수집 범위와 목적 외 제3자 제공 금지 조항 확인",
        "표준계약서 제12조는 필요 최소한의 정보만 수집하고 동의 없는 목적 외 이용·제3자 제공을 "
        "금지합니다.",
        "OFFICIAL",
        "공정위 결혼준비대행업 표준계약서(제10082호) 제12조",
        _FTC_AGENCY_URL,
        13,
    ),
    ChecklistTemplateItem(
        "SDM",
        "CONTRACT_TERM",
        _SDM_GROUP_LABEL,
        "지급보증보험 가입 여부와 보장 내용 고지 여부 확인",
        "표준계약서 제8조⑤는 대행업자가 지급보증보험에 가입했다면 그 종류와 보장 내용을 "
        "이용자에게 고지하도록 정합니다.",
        "OFFICIAL",
        "공정위 결혼준비대행업 표준계약서(제10082호) 제8조",
        _FTC_AGENCY_URL,
        14,
    ),
    # ===== MEETING — CONSENSUS 5개(전부 PREP, BASELINE §6-1 배분표 그대로) =====
    ChecklistTemplateItem(
        "MEETING",
        "PREP",
        GROUP_LABEL_BY_ITEM_TYPE["PREP"],
        "상견례 장소는 양가 접근성을 고려해 중간 지점으로 정하기",
        "한쪽 가족에게만 유리한 장소는 부담을 줄 수 있으니 이동 거리를 균형 있게 고려하세요.",
        "CONSENSUS",
        "메리맵 자체 정리",
        None,
        1,
    ),
    ChecklistTemplateItem(
        "MEETING",
        "PREP",
        GROUP_LABEL_BY_ITEM_TYPE["PREP"],
        "예물·예단 금액은 상견례 당일이 아니라 사전 협의로 정리하기",
        "상견례 자리에서 즉흥적으로 금액을 정하면 갈등이 생기기 쉬우니 미리 신랑신부가 조율해두세요.",
        "CONSENSUS",
        "메리맵 자체 정리",
        None,
        2,
    ),
    ChecklistTemplateItem(
        "MEETING",
        "PREP",
        GROUP_LABEL_BY_ITEM_TYPE["PREP"],
        "결혼 준비 예산 총액과 항목별 배분을 상견례 전 부모님과 공유하기",
        "예산 규모에 대한 기대치가 다르면 이후 준비 과정에서 계속 부딪힐 수 있습니다.",
        "CONSENSUS",
        "메리맵 자체 정리",
        None,
        3,
    ),
    ChecklistTemplateItem(
        "MEETING",
        "PREP",
        GROUP_LABEL_BY_ITEM_TYPE["PREP"],
        "신혼집 마련 방식과 부담 비율을 상견례 전 미리 조율하기",
        "전세·매매 여부와 양가 부담 비율은 예산 계획 전체에 영향을 주므로 일찍 정할수록 좋습니다.",
        "CONSENSUS",
        "메리맵 자체 정리",
        None,
        4,
    ),
    ChecklistTemplateItem(
        "MEETING",
        "PREP",
        GROUP_LABEL_BY_ITEM_TYPE["PREP"],
        "예식 날짜 후보 2~3개를 정해 상견례에서 확정하기",
        "날짜가 늦게 정해지면 예식장·스드메 예약이 밀려 선택지가 줄어듭니다.",
        "CONSENSUS",
        "메리맵 자체 정리",
        None,
        5,
    ),
    # ===== GIFT — CONSENSUS 5개(1 CONTRACT_TERM + 2 EXTRA_COST + 2 PREP, BASELINE §6-1) =====
    ChecklistTemplateItem(
        "GIFT",
        "CONTRACT_TERM",
        GROUP_LABEL_BY_ITEM_TYPE["CONTRACT_TERM"],
        "예물 구매 시 보증서·감정서 발급과 AS 조건을 계약서로 확인",
        "다이아몬드·귀금속은 감정서 없이 구매하면 등급·진위를 나중에 확인하기 어렵습니다. "
        "사이즈 조정 등 AS 조건도 서면으로 받으세요.",
        "CONSENSUS",
        "메리맵 자체 정리(예물 구매 실무 관행)",
        None,
        1,
    ),
    ChecklistTemplateItem(
        "GIFT",
        "EXTRA_COST",
        GROUP_LABEL_BY_ITEM_TYPE["EXTRA_COST"],
        "다이아몬드 등급(4C) 대비 가격이 적정한지 여러 업체 견적으로 비교",
        "같은 캐럿이라도 컷·컬러·투명도 등급에 따라 가격 차이가 크므로 등급 기준 견적을 "
        "비교하세요.",
        "CONSENSUS",
        "메리맵 자체 정리(예물 구매 실무 관행)",
        None,
        2,
    ),
    ChecklistTemplateItem(
        "GIFT",
        "EXTRA_COST",
        GROUP_LABEL_BY_ITEM_TYPE["EXTRA_COST"],
        "반지 사이즈 조정·각인 등 후속 작업 비용이 별도인지 확인",
        "구매 후 사이즈 조정이나 각인이 무료 서비스인지 별도 비용인지 미리 확인하세요.",
        "CONSENSUS",
        "메리맵 자체 정리(예물 구매 실무 관행)",
        None,
        3,
    ),
    ChecklistTemplateItem(
        "GIFT",
        "PREP",
        GROUP_LABEL_BY_ITEM_TYPE["PREP"],
        "예단 형식(현금·예단비·생략)을 상견례 전에 양가와 합의",
        "지역·집안마다 예단 관행이 달라 사전 조율 없이는 오해가 생기기 쉽습니다.",
        "CONSENSUS",
        "메리맵 자체 정리",
        None,
        4,
    ),
    ChecklistTemplateItem(
        "GIFT",
        "PREP",
        GROUP_LABEL_BY_ITEM_TYPE["PREP"],
        "예물 구매는 예식 1~2개월 전 여유 있게 진행",
        "사이즈 조정·각인 시간을 고려해 너무 임박하지 않게 구매 일정을 잡으세요.",
        "CONSENSUS",
        "메리맵 자체 정리",
        None,
        5,
    ),
    # ===== HOMEWARE — CONSENSUS 5개(1 CONTRACT_TERM + 2 EXTRA_COST + 2 PREP) =====
    ChecklistTemplateItem(
        "HOMEWARE",
        "CONTRACT_TERM",
        GROUP_LABEL_BY_ITEM_TYPE["CONTRACT_TERM"],
        "가전·가구 구매 시 배송·설치일과 하자 교환·환불 조건을 계약서로 확인",
        "구두 약속만으로는 배송 지연이나 하자 발생 시 대응이 어렵습니다. 배송일과 교환·환불 "
        "조건을 서면으로 받으세요.",
        "CONSENSUS",
        "메리맵 자체 정리(혼수 구매 실무 관행)",
        None,
        1,
    ),
    ChecklistTemplateItem(
        "HOMEWARE",
        "EXTRA_COST",
        GROUP_LABEL_BY_ITEM_TYPE["EXTRA_COST"],
        "대형 가전 구매 시 기존 제품 폐기·처리 비용이 별도인지 확인",
        "냉장고·세탁기 등 대형 가전은 폐기물 처리 비용이 무료인지 별도인지 매장마다 다릅니다.",
        "CONSENSUS",
        "메리맵 자체 정리(혼수 구매 실무 관행)",
        None,
        2,
    ),
    ChecklistTemplateItem(
        "HOMEWARE",
        "EXTRA_COST",
        GROUP_LABEL_BY_ITEM_TYPE["EXTRA_COST"],
        "인테리어 시공 시 확장·철거 등 추가 공사비가 견적에 포함됐는지 확인",
        "기본 시공 견적에 확장·철거·전기공사 등이 빠져 있으면 착공 후 추가 청구되는 경우가 "
        "많습니다.",
        "CONSENSUS",
        "메리맵 자체 정리(혼수 구매 실무 관행)",
        None,
        3,
    ),
    ChecklistTemplateItem(
        "HOMEWARE",
        "PREP",
        GROUP_LABEL_BY_ITEM_TYPE["PREP"],
        "신혼집 평수·구조를 먼저 확정한 뒤 혼수 구매 순서를 정하기",
        "공간 크기를 모른 채 가전·가구를 먼저 사면 배치가 맞지 않을 수 있습니다.",
        "CONSENSUS",
        "메리맵 자체 정리",
        None,
        4,
    ),
    ChecklistTemplateItem(
        "HOMEWARE",
        "PREP",
        GROUP_LABEL_BY_ITEM_TYPE["PREP"],
        "혼수 구매는 배송 일정을 고려해 예식 1~2개월 전 계약",
        "인기 제품은 배송이 지연될 수 있으니 입주 일정에 맞춰 여유 있게 계약하세요.",
        "CONSENSUS",
        "메리맵 자체 정리",
        None,
        5,
    ),
    # ===== INVITATION — CONSENSUS 5개(1 CONTRACT_TERM + 2 EXTRA_COST + 2 PREP) =====
    ChecklistTemplateItem(
        "INVITATION",
        "CONTRACT_TERM",
        GROUP_LABEL_BY_ITEM_TYPE["CONTRACT_TERM"],
        "청첩장 인쇄 계약 시 최소 발주 수량과 파본·재인쇄 조건 확인",
        "인쇄소마다 최소 발주 수량이 있고, 파본 발생 시 재인쇄 비용 부담 주체가 다르니 미리 "
        "확인하세요.",
        "CONSENSUS",
        "메리맵 자체 정리(청첩장 제작 실무 관행)",
        None,
        1,
    ),
    ChecklistTemplateItem(
        "INVITATION",
        "EXTRA_COST",
        GROUP_LABEL_BY_ITEM_TYPE["EXTRA_COST"],
        "모바일 청첩장 제작 시 추가 페이지·동영상 삽입 옵션 비용 확인",
        "기본 템플릿 외 페이지 추가나 영상 삽입은 유료 옵션인 경우가 많습니다.",
        "CONSENSUS",
        "메리맵 자체 정리(청첩장 제작 실무 관행)",
        None,
        2,
    ),
    ChecklistTemplateItem(
        "INVITATION",
        "EXTRA_COST",
        GROUP_LABEL_BY_ITEM_TYPE["EXTRA_COST"],
        "답례품 개별 포장·각인 서비스가 기본 단가에 포함되는지 확인",
        "답례품 개당 단가에 포장·각인이 포함되는지, 별도 옵션인지 확인하세요.",
        "CONSENSUS",
        "메리맵 자체 정리(청첩장 제작 실무 관행)",
        None,
        3,
    ),
    ChecklistTemplateItem(
        "INVITATION",
        "PREP",
        GROUP_LABEL_BY_ITEM_TYPE["PREP"],
        "하객 명단과 발송 인원을 먼저 확정한 뒤 청첩장 수량 결정",
        "명단이 확정되지 않은 채 수량을 정하면 추가 인쇄나 낭비가 생길 수 있습니다.",
        "CONSENSUS",
        "메리맵 자체 정리",
        None,
        4,
    ),
    ChecklistTemplateItem(
        "INVITATION",
        "PREP",
        GROUP_LABEL_BY_ITEM_TYPE["PREP"],
        "청첩장은 예식 1~2개월 전 발송할 수 있도록 제작 일정을 역산",
        "너무 이르면 하객이 잊고, 너무 늦으면 일정 조율이 어려우니 발송 시점을 기준으로 제작 "
        "일정을 짜세요.",
        "CONSENSUS",
        "메리맵 자체 정리",
        None,
        5,
    ),
    # ===== HONEYMOON — CONSENSUS 5개(1 CONTRACT_TERM + 2 EXTRA_COST + 2 PREP) =====
    ChecklistTemplateItem(
        "HONEYMOON",
        "CONTRACT_TERM",
        GROUP_LABEL_BY_ITEM_TYPE["CONTRACT_TERM"],
        "여행 패키지·항공권 계약 시 취소·환불 수수료 규정을 예약 전에 확인",
        "여행사·항공사마다 취소 시점별 환불 수수료율이 달라 예약 전 정확히 확인해야 합니다.",
        "CONSENSUS",
        "메리맵 자체 정리(신혼여행 실무 관행)",
        None,
        1,
    ),
    ChecklistTemplateItem(
        "HONEYMOON",
        "EXTRA_COST",
        GROUP_LABEL_BY_ITEM_TYPE["EXTRA_COST"],
        "리조트 업그레이드·조식 옵션이 기본 요금에 포함되는지 확인",
        "허니문 패키지의 룸 업그레이드나 조식이 기본 포함인지 유료 옵션인지 확인하세요.",
        "CONSENSUS",
        "메리맵 자체 정리(신혼여행 실무 관행)",
        None,
        2,
    ),
    ChecklistTemplateItem(
        "HONEYMOON",
        "EXTRA_COST",
        GROUP_LABEL_BY_ITEM_TYPE["EXTRA_COST"],
        "여행자보험 가입 여부와 보장 범위(수하물·여행 취소 등)를 별도 확인",
        "여행자보험이 패키지에 기본 포함되는지, 보장 범위가 충분한지 별도로 확인하세요.",
        "CONSENSUS",
        "메리맵 자체 정리(신혼여행 실무 관행)",
        None,
        3,
    ),
    ChecklistTemplateItem(
        "HONEYMOON",
        "PREP",
        GROUP_LABEL_BY_ITEM_TYPE["PREP"],
        "여권 유효기간(잔여 6개월 이상)과 비자 필요 여부를 여행 2개월 전 확인",
        "많은 국가가 입국 시 여권 잔여 유효기간 6개월 이상을 요구하니 미리 갱신 여부를 확인하세요.",
        "CONSENSUS",
        "메리맵 자체 정리",
        None,
        4,
    ),
    ChecklistTemplateItem(
        "HONEYMOON",
        "PREP",
        GROUP_LABEL_BY_ITEM_TYPE["PREP"],
        "신혼여행은 성수기 가격 변동을 고려해 6개월~1년 전 예약",
        "허니문 성수기 항공권·숙박은 일찍 예약할수록 가격과 선택지가 유리합니다.",
        "CONSENSUS",
        "메리맵 자체 정리",
        None,
        5,
    ),
    # ===== HOMENEW — CONSENSUS 5개(v4.0 신규 카테고리, ds6 원본 없어 이 자리에서 신규 저작,
    # GIFT/HOMEWARE 등과 동일하게 1 CONTRACT_TERM + 2 EXTRA_COST + 2 PREP 배분) =====
    ChecklistTemplateItem(
        "HOMENEW",
        "CONTRACT_TERM",
        GROUP_LABEL_BY_ITEM_TYPE["CONTRACT_TERM"],
        "전월세 계약 전 등기부등본으로 근저당·보증금 규모를 확인",
        "근저당이 과도하게 설정된 집은 계약 종료 시 전세보증금을 못 돌려받을 위험이 있습니다. "
        "계약 직전 등기부등본을 재발급받아 확인하세요.",
        "CONSENSUS",
        "메리맵 자체 정리(신혼집 마련 실무 관행)",
        None,
        1,
    ),
    ChecklistTemplateItem(
        "HOMENEW",
        "EXTRA_COST",
        GROUP_LABEL_BY_ITEM_TYPE["EXTRA_COST"],
        "중개수수료 요율과 부가세 포함 여부를 계약 전 중개사에게 서면으로 확인",
        "중개수수료는 거래금액과 지역별 상한요율이 있고 부가세 별도 여부도 업체마다 달라 "
        "계약서에 명시된 금액을 미리 확인해야 합니다.",
        "CONSENSUS",
        "메리맵 자체 정리(신혼집 마련 실무 관행)",
        None,
        2,
    ),
    ChecklistTemplateItem(
        "HOMENEW",
        "EXTRA_COST",
        GROUP_LABEL_BY_ITEM_TYPE["EXTRA_COST"],
        "입주 청소·인테리어 등 이사 부대비용을 별도 예산으로 잡기",
        "집값·보증금 외에 청소, 도배·장판, 이사비 등 부대비용이 추가로 들어가니 미리 예산에 "
        "포함하세요.",
        "CONSENSUS",
        "메리맵 자체 정리(신혼집 마련 실무 관행)",
        None,
        3,
    ),
    ChecklistTemplateItem(
        "HOMENEW",
        "PREP",
        GROUP_LABEL_BY_ITEM_TYPE["PREP"],
        "전세보증금 반환보증보험 가입 가능 여부를 계약 전 확인",
        "임대인 동의 없이도 가입 가능한 보증상품이 있으니 계약 전 가입 요건을 확인해두면 "
        "보증금을 지키는 데 도움이 됩니다.",
        "CONSENSUS",
        "메리맵 자체 정리",
        None,
        4,
    ),
    ChecklistTemplateItem(
        "HOMENEW",
        "PREP",
        GROUP_LABEL_BY_ITEM_TYPE["PREP"],
        "신혼집 계약은 혼수 구매 일정에 영향을 주므로 예식 3~4개월 전 여유 있게 진행",
        "집이 정해져야 평수·구조에 맞춰 혼수를 고를 수 있어, 너무 임박하면 뒤 일정이 줄줄이 "
        "밀립니다.",
        "CONSENSUS",
        "메리맵 자체 정리",
        None,
        5,
    ),
    # ===== ETC — CONSENSUS 5개(v4.0 신규 카테고리, 특정 계약·비용 유형이 없어 MEETING과 동일하게
    # 전부 PREP로 구성) =====
    ChecklistTemplateItem(
        "ETC",
        "PREP",
        GROUP_LABEL_BY_ITEM_TYPE["PREP"],
        "예산 관리 앱이나 스프레드시트로 카테고리별 지출을 한곳에 기록하기",
        "여러 업체에 흩어진 지출을 한곳에 모아두면 예산 초과 여부를 빨리 알아챌 수 있습니다.",
        "CONSENSUS",
        "메리맵 자체 정리(결혼 준비 실무 팁)",
        None,
        1,
    ),
    ChecklistTemplateItem(
        "ETC",
        "PREP",
        GROUP_LABEL_BY_ITEM_TYPE["PREP"],
        "계약서·영수증 원본은 스캔해서 사본을 별도 보관하기",
        "원본을 분실해도 분쟁이나 환불 요청 시 사본으로 근거를 남길 수 있습니다.",
        "CONSENSUS",
        "메리맵 자체 정리(결혼 준비 실무 팁)",
        None,
        2,
    ),
    ChecklistTemplateItem(
        "ETC",
        "PREP",
        GROUP_LABEL_BY_ITEM_TYPE["PREP"],
        "예식 당일 업체별 담당자 연락처를 하나로 정리해두기",
        "당일 돌발 상황에서 각 업체 연락처를 흩어진 곳에서 찾다 보면 대응이 늦어질 수 있습니다.",
        "CONSENSUS",
        "메리맵 자체 정리(결혼 준비 실무 팁)",
        None,
        3,
    ),
    ChecklistTemplateItem(
        "ETC",
        "PREP",
        GROUP_LABEL_BY_ITEM_TYPE["PREP"],
        "결혼 준비 막바지(예식 1~2개월 전)엔 개인 일정에 여유를 두기",
        "여러 업체 컨택이 몰리는 시기라 컨디션 관리를 위해 다른 약속을 줄여두는 게 좋습니다.",
        "CONSENSUS",
        "메리맵 자체 정리(결혼 준비 실무 팁)",
        None,
        4,
    ),
    ChecklistTemplateItem(
        "ETC",
        "PREP",
        GROUP_LABEL_BY_ITEM_TYPE["PREP"],
        "우천 등 돌발 상황에 대비한 실내 대안 동선을 예식장·업체와 미리 확인하기",
        "야외 촬영·행사가 포함돼 있다면 우천 시 대체 장소나 일정을 미리 협의해두세요.",
        "CONSENSUS",
        "메리맵 자체 정리(결혼 준비 실무 팁)",
        None,
        5,
    ),
)
