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

// RFC 1918 사설 대역 — 10.0.0.0/8 · 172.16.0.0/12 · 192.168.0.0/16. 같은 와이파이 안에서
// 다른 기기(휴대폰 등)로 개발 서버를 테스트할 때 http:// 를 쓸 수 있게 하기 위한 개발 편의
// 예외다(2026-08-26). 운영 인그레스가 아니라 uvicorn 이 http 로 직접 뜨는 로컬/LAN 환경에는
// 원래 이 검사가 막으려던 "308 리다이렉트에 CORS 헤더가 없어 조용히 죽는" 시나리오 자체가
// 없다. 프로덕션으로 새지 않게 하는 책임은 이 예외가 아니라 `isLocalOnlyApiBase`(배포 게이트)가
// 진다 — 그쪽은 사설 LAN 도 loopback 과 똑같이 차단한다.
function isPrivateLanHost(hostname: string): boolean {
  const octets = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/u.exec(hostname);
  if (octets === null) return false;
  const first = Number(octets[1]);
  const second = Number(octets[2]);
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

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
  if (url.protocol === "http:" && !LOOPBACK_HOSTS.has(url.hostname) && !isPrivateLanHost(url.hostname)) {
    return (
      `http:// 는 루프백·사설 LAN(10/8·172.16/12·192.168/16)에만 허용한다 (호스트 ${url.hostname}) — ` +
      "그 밖의 원격은 https:. 인그레스가 내는 308 에 Access-Control-Allow-Origin 이 없어 브라우저에서만 조용히 죽는다"
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

/**
 * 배포 빌드 게이트용. 형식 검사(checkApiBase)는 로컬 개발 편의로 루프백·사설 LAN 의 http:// 를
 * 허용하므로 **배포 산출물엔 그 값이 절대 들어가면 안 된다** — 적용 시점으로 나눈다.
 * (예전 이름 `isLoopbackApiBase` — 사설 LAN 예외가 생기며 판정 범위를 넓혀 개명했다, 2026-08-26.)
 */
export function isLocalOnlyApiBase(value: string): boolean {
  try {
    const { hostname } = new URL(value);
    return LOOPBACK_HOSTS.has(hostname) || isPrivateLanHost(hostname);
  } catch {
    return false;
  }
}
