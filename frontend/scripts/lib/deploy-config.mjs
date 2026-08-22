// 배포 설정 게이트 — `dist/staticwebapp.config.json` 이 **있고, 라우터가 요구하는 최소 계약을 담는가**.
//
// 왜 필요한가 (CLAUDE.md §6-H) — Azure Static Web Apps 는 이 파일을 **산출물 루트**에서 읽는다.
// 공식 문서: *"if there's a build step, you must ensure the build step outputs the file to the root of
// the output_location"* (learn.microsoft.com/azure/static-web-apps/configuration#file-location).
// 라우터(ADR 0005)는 `/timeline` 같은 경로를 만들지만 서버가 그 경로에서 `index.html` 을 주지 않으면
// **링크 공유와 새로고침이 404** 가 된다 — 라우터의 존재 이유(공유 가능한 URL)가 프로덕션에서만
// 조용히 깨지는 경로다. `vite preview` 는 자체 폴백이 있어 로컬에서는 **재현되지 않는다.**
// 그래서 빌드 게이트가 산출물을 직접 본다.
//
// 순수 함수다 — 파일 읽기는 호출자가 한다(테스트가 문자열로 주입한다).

/**
 * @param {string | null} text  dist/staticwebapp.config.json 의 내용. 파일이 없으면 null.
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function checkDeployConfig(text) {
  const problems = [];
  if (text === null) {
    return {
      ok: false,
      problems: [
        "dist/staticwebapp.config.json 이 없다 — public/staticwebapp.config.json 이 빌드로 복사돼야 한다. 없으면 배포 후 /timeline 새로고침이 404 다",
      ],
    };
  }

  let config;
  try {
    config = JSON.parse(text);
  } catch (error) {
    return { ok: false, problems: [`JSON 파싱 실패 — ${error instanceof Error ? error.message : String(error)}`] };
  }

  // ① SPA 폴백 — 라우터 딥링크의 전제.
  const fallback = config.navigationFallback;
  if (fallback?.rewrite !== "/index.html") {
    problems.push("navigationFallback.rewrite 가 '/index.html' 이 아니다 — 딥링크·새로고침이 404 가 된다");
  }
  // ② 폴백에서 자산 제외 — 없으면 존재하지 않는 청크 요청에 index.html(HTML)이 돌아와
  //    브라우저가 JS 로 파싱하다 실패한다. 404 가 더 정직하다.
  if (!Array.isArray(fallback?.exclude) || !fallback.exclude.includes("/assets/*")) {
    problems.push("navigationFallback.exclude 에 '/assets/*' 가 없다 — 빠진 청크 요청에 HTML 이 돌아온다");
  }
  // ③ 해시 자산의 장기 캐시 — Vite 는 파일명에 내용 해시를 붙이므로 immutable 이 안전하고, 청크가
  //    7개로 늘어 가치가 커졌다(CLAUDE.md §6-H). 없어도 동작은 하지만 재방문마다 전부 재검증한다.
  const assetRoute = Array.isArray(config.routes) ? config.routes.find((r) => r?.route === "/assets/*") : undefined;
  const cache = assetRoute?.headers?.["Cache-Control"] ?? "";
  if (!/immutable/u.test(cache) || !/max-age=\d+/u.test(cache)) {
    problems.push("routes 에 '/assets/*' 의 Cache-Control(max-age + immutable) 이 없다 — 해시 자산이 재방문마다 재검증된다");
  }
  // ④ HTML 은 캐시하지 않는다 — 배포 직후 옛 index.html 이 새 청크 이름을 모르면 화면이 깨진다.
  //    globalHeaders 가 모든 응답에 붙고 /assets/* 라우트가 그것을 덮어쓴다(공식 문서: route 헤더가 global 을 이긴다).
  const globalCache = config.globalHeaders?.["Cache-Control"] ?? "";
  if (!/no-cache|no-store/u.test(globalCache)) {
    problems.push("globalHeaders.Cache-Control 이 no-cache 가 아니다 — 배포 직후 옛 index.html 이 새 청크를 못 찾는다");
  }
  // ⑤ CSP 가 있다면 앱이 실제로 쓰는 것을 막지 않아야 한다 — Base UI Progress 는 인라인 style 속성(width)을 쓴다.
  const csp = config.globalHeaders?.["Content-Security-Policy"];
  if (typeof csp === "string") {
    const styleSrc = /style-src\s+([^;]+)/u.exec(csp)?.[1] ?? "";
    if (!styleSrc.includes("'unsafe-inline'")) {
      problems.push("CSP style-src 에 'unsafe-inline' 이 없다 — Base UI Progress 의 인라인 width 가 막혀 진행률 바가 0% 로 보인다");
    }
  }

  return { ok: problems.length === 0, problems };
}
