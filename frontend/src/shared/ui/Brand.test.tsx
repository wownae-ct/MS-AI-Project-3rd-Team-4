// 브랜드 마크 계약 (decisions.md D15).
//
// 여기서 고정하는 건 "로고가 보인다"가 아니라 **눈으로는 회귀를 못 잡는 세 결정**이다 —
// ① 변이마다 접근명이 다르다 ② width/height 를 둘 다 낸다(CLS) ③ 두 원본이 정사각이 아니라
// 비율 계산이 변이별로 갈린다.
//
// ⚠️ RTL 렌더 루트를 구조 분해로 꺼내지 않는다(`render()` 반환값의 그 필드 이름을 쓰지 않는다) —
// 그 **식별자**가 그대로 Tailwind 스캐너의 후보가 되어 산출 CSS 에 쓰지도 않는 유틸리티 6규칙이
// 생긴다. Card.test.tsx 가 실제로 당했고 scripts/lib/__tests__/ghost-candidates.test.mjs 가 그
// 재발을 막는다 — **이 주석에 그 단어를 그대로 적어도 똑같이 걸린다**(스캐너는 파일을 파싱하지
// 않고 평문으로 훑는다). 이 저장소의 관례대로 `document.querySelector` 로 찾는다.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Brand } from "./Brand";

describe("Brand", () => {
  // 워드마크는 옆에 텍스트가 없다 — 이 이미지가 유일한 브랜드 표기라 이름을 전달해야 한다.
  // 로고타입은 라틴 "merrymap" 이지만 접근명은 UI 전반이 쓰는 한국어 제품명으로 맞춘다.
  it("워드마크는 접근명을 갖는다 — 유일한 브랜드 표기다", () => {
    render(<Brand />);
    expect(screen.getByRole("img", { name: "메리맵" })).toBeInTheDocument();
  });

  // alt="" 는 접근성 트리에서 이미지를 뺀다. 심볼의 유일한 사용처(생성 오버레이)는 안내 문구
  // 2줄이 이미 말을 하고 있어 장식이 맞다 — 대기 안내를 제품명으로 밀어내지 않는다.
  it("심볼은 접근명을 갖지 않는다 — 유일한 사용처에서 장식이다", () => {
    render(<Brand variant="symbol" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(document.querySelector("img")).toHaveAttribute("alt", "");
  });

  // 워드마크 원본 461×96 = 4.803:1 (logo-text-3 을 알파 bbox 로 크롭한 실측 비율).
  // 26 → round(26 × 461/96) = 125.
  it("워드마크는 size 를 높이로 삼고 4.803:1 비율로 width 를 함께 낸다", () => {
    render(<Brand size={26} />);
    const img = document.querySelector("img");
    expect(img).toHaveAttribute("height", "26");
    expect(img).toHaveAttribute("width", "125");
  });

  // 심볼 원본 1024×951 = 1.0768:1. 56 → round(56 × 1024/951) = 60.
  // 두 변이의 비율이 4배 넘게 다르다 — 하나의 상수로 뭉뚱그리면 한쪽이 찌그러진다.
  it("심볼은 자기 비율(1.0768:1)로 계산한다 — 워드마크와 다르다", () => {
    render(<Brand size={56} variant="symbol" />);
    const img = document.querySelector("img");
    expect(img).toHaveAttribute("height", "56");
    expect(img).toHaveAttribute("width", "60");
  });
});
