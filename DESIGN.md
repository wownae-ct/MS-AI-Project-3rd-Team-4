---
name: 메리맵
description: 결혼 준비 예산·체크리스트·AI상담 앱 — 정돈되어 있되 몽글몽글함을 지키는 톤
colors:
  primary: "#8B3F63"
  primary-soft: "#F1DEE7"
  ink: "#1D1B19"
  ink-soft: "#726B65"
  bg: "#F7F6F4"
  surface: "#FFFFFF"
  line: "#E7E3DE"
typography:
  heading:
    fontFamily: "Wanted Sans Variable, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontWeight: 700
  body:
    fontFamily: "Wanted Sans Variable, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
    fontWeight: 400
rounded:
  sm: "8px"
  md: "10px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "20px"
  xl: "24px"
components:
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
    padding: "5px 11px"
  badge-focus:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
    rounded: "{rounded.pill}"
---

# Design System: 메리맵

## Overview

**Creative North Star: "몽글한 정리함"**

정리되어 있지만 차갑지 않은, 결혼을 앞둔 사람 특유의 몽글몽글함을 잃지 않는 상태를 목표로 한다.
핀테크 앱의 정밀하고 차가운 정돈(초기 탐색안 "레이더 시그널")도 아니고, 서비스 전체를 로고 톤
그대로(파스텔 그라디언트·글로시 3D) 따라가는 것도 아니다 — 무채색에 가까운 중립 베이스 위에
포인트 컬러 하나만 절제해서 쓰는 쪽으로 수렴했다.

이 방향은 사용자와의 반복 비교(레이더/토스미니멀/웨딩저널 3안 → 몽글/차분/정돈 축 3안 → 코랄/
베리플럼/세이지 3색)를 거쳐 확정됐다. 로고 초안(파스텔 핑크→라벤더→블루 글로시 3D 핀+반지
아이콘)은 참고만 하고 그대로 따르지 않기로 확인됨 — PRODUCT.md의 Brand Commitments 참고.

**Key Characteristics:**
- 거의 무채색인 중립 베이스 + 포인트 컬러 하나 (Committed 아닌 Restrained 전략)
- 그림자 없음, 1px 헤어라인 보더로만 표면을 구분
- 라운드는 절제(10px 안팎) — 로고의 과한 둥글기를 따라가지 않음
- 숫자(금액)는 항상 tabular-nums + 굵은 웨이트로 스캔하기 쉽게

## Colors

거의 무채색에 가까운 중립 위에 베리 플럼 하나만 얹는다.

### Primary
- **베리 플럼** (`#8B3F63`): FOCUS 배지, 주요 액션(버튼/링크), 강조 텍스트, 진행률 바 채움색.
  화면 전체 면적의 일부에만 등장 — 배경색으로는 쓰지 않는다.

### Neutral
- **잉크** (`#1D1B19`): 본문 텍스트, 헤드라인.
- **소프트 잉크** (`#726B65`): 보조 텍스트, 캡션, 비활성 라벨.
- **배경** (`#F7F6F4`): 페이지/화면 배경.
- **서피스** (`#FFFFFF`): 카드, 팝오버 등 떠 있는 표면.
- **라인** (`#E7E3DE`): 카드 보더, 구분선, 진행률 바 트랙.

### Named Rules

**The One Accent Rule.** 베리 플럼은 FOCUS 배지·주요 버튼·강조 텍스트에만 쓴다. 배경 워시, 큰
면적 채우기로 쓰지 않는다 — 희소성이 곧 그 색의 힘이다.

**The No-Pink-Cliché Rule.** "웨딩 = 핑크+세리프+그라디언트" 클리셰를 의식적으로 피한다. 베리
플럼은 채도를 낮춘 와인 톤이지 밝은 핑크가 아니다.

## Typography

**Display/Body Font:** Wanted Sans Variable (fallback: Apple SD Gothic Neo, Malgun Gothic, sans-serif)

**Character:** 하나의 가변 폰트 패밀리로 무게만 바꿔 위계를 만든다. Pretendard(현재 한국 프로덕트
UI의 사실상 기본값)와 Apple SD Gothic Neo(iOS 전용, 크로스플랫폼 웹에 임베드 불가)는 검토 후
제외했다.

### Hierarchy
- **Headline** (weight 700, ~1.2–1.3rem, line-height 1.4): 카드/섹션 제목.
- **Body** (weight 400, ~0.86rem, line-height 1.6): 설명 텍스트, 보조 문구.
- **Number** (weight 700, tabular-nums): 금액 표시 전용 — 헤드라인과 같은 굵기지만 자릿수가
  맞춰지도록 tabular-nums를 강제한다.

## Elevation & Depth

그림자를 쓰지 않는다. 표면 구분은 전부 1px 헤어라인 보더(`{colors.line}`)로만 한다 — 지금까지
탐색한 모든 목업이 `box-shadow` 없이 flat + border 조합으로만 만들어졌다.

### Named Rules
**The Flat-By-Default Rule.** 카드/버튼은 항상 평평하다. 입체감이 필요한 순간(호버, 포커스)이
와도 그림자보다 보더 색 변화나 아주 옅은 배경색 변화로 표현한다 — 아직 실제로 확정된 호버 상태는
없음(열린 결정, S2 실구현 때 확정).

## Shapes

- **카드/버튼 라운드**: 10px 안팎 (`{rounded.md}`) — 로고의 과한 둥글기(20px+)를 따라가지 않음.
- **배지(badge)**: 완전한 pill (`{rounded.pill}`).
- **보더**: 항상 1px, `{colors.line}`.

## Do's and Don'ts

- **Do** 색은 베리 플럼 하나로 제한한다. 상태 색(성공/경고/위험 등 semantic color)은 아직
  미확정 — S2 대시보드 실구현 때 별도로 정한다(지금 목업엔 진행률 바 채움 외에 상태 색을 쓴 적이
  없음).
- **Do** 금액은 항상 tabular-nums.
- **Don't** Pretendard를 기본 서체로 쓰지 않는다 — 지금 한국 프로덕트 UI 어디서나 보이는 폰트라
  브랜드 식별력이 떨어진다는 이유로 명시적으로 기각했다.
- **Don't** 로고의 파스텔 그라디언트·글로시 3D를 인앱 화면 톤으로 그대로 가져오지 않는다 — 로고는
  느슨한 참고일 뿐 인앱 UI의 규범이 아니다.
- **Don't** "웨딩 = 밝은 핑크 + 세리프 + 그라디언트" 클리셰 조합을 쓰지 않는다.
