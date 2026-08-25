// 3단계: 웨딩 취향(스킵 가능). 시각 스펙 s1-onboarding.html:271-290.
//
// 4개 카드 라벨은 목업 그대로("미니멀/가성비/화려함/균형 잡힘")지만 값은 목업이 아니라
// `04_DB_spec.md:113`의 실제 4종 ENUM(`MINIMAL`/`BUDGET`/`GRAND`/`BALANCED`)을 쓴다 — entities/
// wedding의 TastePreference가 3종(LUXURY 포함)으로 잘못 옮겨져 있던 것을 이 단계를 만들며 바로잡았다
// (OnboardingPage.tsx가 아니라 여기 적는 이유: 이 단계가 그 타입의 유일한 소비처라 함께 바뀐다).
import type { TastePreference } from "@/entities/wedding";
import { CHOICE_CARD_BASE, CHOICE_CARD_SELECTED, CHOICE_CARD_SUB, CHOICE_CARD_TITLE, CHOICE_CARD_TITLE_SELECTED } from "../onboarding-styles";

const TASTE_CARDS: { value: TastePreference; title: string; sub: string }[] = [
  { value: "MINIMAL", title: "미니멀", sub: "군더더기 없이 심플하게" },
  { value: "BUDGET", title: "가성비", sub: "합리적인 비용 안에서" },
  { value: "GRAND", title: "화려함", sub: "한 번뿐이니 아낌없이" },
  { value: "BALANCED", title: "균형 잡힘", sub: "가성비와 로망 사이 어딘가" },
];

export interface Step3Props {
  tastePreference: TastePreference | null;
  onTastePreferenceChange: (value: TastePreference) => void;
}

export function Step3Taste({ tastePreference, onTastePreferenceChange }: Step3Props) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {TASTE_CARDS.map((card) => {
        const isSelected = tastePreference === card.value;
        return (
          <button
            key={card.value}
            type="button"
            className={isSelected ? CHOICE_CARD_SELECTED : CHOICE_CARD_BASE}
            onClick={() => onTastePreferenceChange(card.value)}
          >
            <span className={isSelected ? CHOICE_CARD_TITLE_SELECTED : CHOICE_CARD_TITLE}>{card.title}</span>
            <span className={CHOICE_CARD_SUB}>{card.sub}</span>
          </button>
        );
      })}
    </div>
  );
}
