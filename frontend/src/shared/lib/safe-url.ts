// entities/chat(MessageBubble)와 entities/checklist(ChecklistTab)가 둘 다 근거 배지의 원문
// 링크를 렌더한다 — entities는 서로를 import할 수 없어(.oxlintrc.json no-restricted-imports)
// shared로 뺀다. source-tier.ts와 같은 이유.
//
// source_url이 있어도 스킴 검증 없이 href에 그대로 꽂으면 안 된다(react/security.md 「Unsafe URL
// Schemes」) — RAG 코퍼스/개인화 생성 데이터라 신뢰도는 높지만, 값 자체는 이 함수 바깥(백엔드)에서
// 온 문자열이라 방어적으로 http(s)만 허용한다.
export function safeExternalUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return url;
  } catch {
    return undefined;
  }
  return undefined;
}
