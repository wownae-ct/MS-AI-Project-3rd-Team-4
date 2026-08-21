/// <reference types="vite/client" />

// 프론트 환경변수 타입의 단일 출처.
// 값을 읽는 코드는 현재 없다 — 전송 계층이 src 초기화 때 삭제됐다(docs/architecture/toolchain.md §6.3).
// 다시 세울 때 이 선언을 그대로 받아 부재를 명시적으로 다룬다. 조용한 폴백을 두지 않는다.
//
// 주의 1 — 이 파일에 `import` 문을 넣지 말 것.
//   공식 문서: "If the ImportMetaEnv augmentation does not work, make sure you do not have
//   any import statements in vite-env.d.ts." import가 들어가면 전역 증강이 모듈 스코프로 바뀌어 조용히 깨진다.
//
// 주의 2 — `vite/client` 참조를 지우지 말 것.
//   TypeScript 7의 noUncheckedSideEffectImports가 기본 활성이라, 이 참조가 제공하는 `*.css`
//   와일드카드 모듈 선언이 없으면 main.tsx의 CSS import가 타입 오류가 된다.

interface ImportMetaEnv {
  /**
   * API 오리진. 끝에 슬래시 없이(예: `https://api.example.com`).
   *
   * **선택 값이다.** 빌드 시 주입되지 않으면 `undefined`가 된다 —
   * 로컬에 값을 안 넣었을 때, 그리고 포크에서 온 PR(러너에 secret이 전달되지 않는다).
   * 그래서 non-optional로 선언하지 않는다. 타입이 런타임보다 낙관적이면 그 자체가 결함이다.
   */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
