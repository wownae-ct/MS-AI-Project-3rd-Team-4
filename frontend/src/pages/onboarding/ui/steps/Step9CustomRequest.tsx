// 9단계(신규, 2026-08-28): 자유 서술 — "더 하고 싶은 말이 있나요?" (custom_request, 선택 입력,
// 최대 500자). 목업(12_final_prototype_mockup.html)엔 이 스텝이 없다 — 완전 신규 필드라 대체할
// 기존 박정건 저작 카피가 없고(Step4Goals.tsx 머리말과 같은 상황), 온보딩 마지막 입력 단계로
// "확인하기 전에 더 남길 말"을 묻는 게 자연스러워 10단계(확인) 바로 앞에 붙였다.
//
// **전용 새 스텝으로 분리한 이유** — 나머지 1~8단계는 전부 정형 입력(select/chip/토글/슬라이더)
// 인데 자유 텍스트 textarea는 입력 형식 자체가 다르다. Step4Goals.tsx(칩 목록)나
// Step10Review.tsx(읽기 전용 요약)에 끼워넣으면 그 스텝의 단일 책임이 깨진다.
//
// **500자 제한은 클라이언트에서도 이중으로 막는다** — <textarea maxLength>가 입력/붙여넣기를
// 막아주지만, onChange에서 한 번 더 slice해 상태 자체가 500자를 넘지 못하게 한다(레포 전체의
// "경계에서 검증" 관례 — 백엔드 CUSTOM_REQUEST_MAX_LENGTH가 최종 방어선이라도 프론트가 이미
// 넘는 값을 상태로 들고 있을 이유가 없다). 500이라는 값 자체는 백엔드
// app/schemas/wedding.py::CUSTOM_REQUEST_MAX_LENGTH와 수동으로 맞춰 관리한다 — 이 레포에
// 백엔드→프론트 상수 코드생성이 없어(WeddingCategoryUpdateInput 등 다른 계약 필드들과 같은
// 관례) 값이 바뀌면 양쪽을 각각 고쳐야 한다.
import { FIELD_LABEL, FIELD_NOTE, TEXTAREA } from "../onboarding-styles";

export const CUSTOM_REQUEST_MAX_LENGTH = 500;

export interface Step9CustomRequestProps {
  customRequest: string;
  onCustomRequestChange: (value: string) => void;
}

export function Step9CustomRequest({ customRequest, onCustomRequestChange }: Step9CustomRequestProps) {
  return (
    <label className={FIELD_LABEL}>
      더 하고 싶은 말이 있나요?
      <textarea
        className={TEXTAREA}
        maxLength={CUSTOM_REQUEST_MAX_LENGTH}
        placeholder="예: 반려동물과 함께하는 결혼식을 준비하고 있어요."
        value={customRequest}
        onChange={(event) => onCustomRequestChange(event.target.value.slice(0, CUSTOM_REQUEST_MAX_LENGTH))}
      />
      <span className={`${FIELD_NOTE} self-end`}>
        {customRequest.length}/{CUSTOM_REQUEST_MAX_LENGTH}자
      </span>
    </label>
  );
}
