// API 오리진 형식 계약 — **순수 함수만 둔다.**
//
// ⚠️ 이 파일에 `import.meta` 를 읽는 코드를 넣지 말 것.
//    vite.config.ts(Node)가 checkApiBase 를 import 하는데, 같은 모듈에 import.meta.env 접근이
//    있으면 Node 가 모듈을 평가할 때 함께 실행돼 **빌드가 죽는다.** 그 부분은 env.ts 소관이다.
//
// 검사 순서가 계약의 일부다 — 빈 값 → 파싱 → 스킴 → 호스트 → 자격증명 → 경로 → 쿼리/해시 →
// 끝 슬래시. 순서가 어긋나면 원인이 아니라 증상을 진단한다(초판이 javascript: 를 「경로 금지」로
// 오진했다).

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** 위반 사유를 돌려준다. 통과면 `null`. 빌드(vite.config.ts)와 런타임이 **같은 함수**를 쓴다. */
export function checkApiBase(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") {
    return "VITE_API_BASE 가 비어 있다 — 폴백하지 않고 여기서 멈춘다";
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return `URL 로 해석되지 않는다: ${JSON.stringify(value)} — 스킴(https://)부터 적는다`;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return `지원하지 않는 스킴: ${url.protocol} — https: 또는 http:(루프백)만 쓴다`;
  }
  if (url.protocol === "http:" && !LOOPBACK_HOSTS.has(url.hostname)) {
    return (
      `http:// 는 루프백에만 허용한다 (호스트 ${url.hostname}) — 원격은 https:. ` +
      "인그레스가 내는 308 에 Access-Control-Allow-Origin 이 없어 브라우저에서만 조용히 죽는다"
    );
  }
  if (url.username !== "" || url.password !== "") {
    return "자격증명을 URL 에 넣지 않는다 — 번들에 그대로 박힌다";
  }
  if (url.pathname !== "/") {
    return `경로를 넣지 않는다 (${url.pathname}) — 오리진만 적고 /api/v1 은 코드가 붙인다`;
  }
  if (url.search !== "" || url.hash !== "") {
    return "쿼리·해시를 넣지 않는다 — 오리진만 적는다";
  }
  if (value.endsWith("/")) {
    return "끝 슬래시 금지 — 경로 조립이 //api 가 된다";
  }
  return null;
}

/** 배포 빌드 게이트용. 형식 검사는 루프백을 허용하므로 **적용 시점**으로 나눈다. */
export function isLoopbackApiBase(value: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(value).hostname);
  } catch {
    return false;
  }
}
