"""체크리스트 개인화 라우터 에이전트 비상 폴백 카탈로그 — 13_personalization_router_agent_design.md
§2, docs/wedding/ing/ds6-checklist-seed-data-prep.md의 OFFICIAL-tier 24항목(VENUE CONTRACT_TERM
10 + SDM CONTRACT_TERM 14) 전사.

validate 노드가 BLOCKED를 반환했을 때만 쓰이는 최후 폴백이다 — 공정위 표준약관/표준계약서 조문을
직접 근거로 삼은(source_tier=OFFICIAL) 항목만 담아, 나머지 CONSENSUS 항목처럼 팀 주관적 판단이
섞이지 않은 객관적 콘텐츠로 제한했다(§2 근거). VENUE/SDM 외 7개 MOCKUP 카테고리는 이 카탈로그가
커버하지 않는다 — 그 카테고리가 활성 상태에서 BLOCKED가 나면 해당 카테고리 체크리스트는 비어 있는
채로 남는 게 이번 라운드가 받아들인 한계(§2가 명시적으로 인정).

group_label은 원본(ds6-checklist-seed-data-prep.md)에 필드 자체가 없어 카테고리 단위로 새로
부여했다(VENUE 전부 동일 값, SDM 전부 동일 값) — item_type이 전부 CONTRACT_TERM이라 item_type
기반 매핑을 쓰면 24개가 전부 같은 값 하나로 뭉개져 "화면에서 항목을 묶어 보여주는 UI 섹션
헤더"라는 group_label의 원래 역할을 못 하기 때문이다(LLM 생성분의 group_label 부여 방식과는
다른 이유 — app/services/personalization.py 참고)."""

from dataclasses import dataclass

from app.schemas.common import CategoryCode

# app/services/personalization.py가 LLM 생성(SUCCESS 경로) 체크리스트 항목의 group_label을
# item_type으로부터 채울 때 쓰는 매핑 — 이 폴백 카탈로그(전부 CONTRACT_TERM, 카테고리별 인라인
# group_label)에는 적용하지 않는다.
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
    source_url: str
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
)
