// @vitest-environment node
//
// 배포 설정 게이트의 계약. 빌드 산출물을 보는 게이트는 빌드 없이는 돌지 않으므로, 판정 함수를
// 여기서 문자열로 고정한다 — 그리고 **실제 public/staticwebapp.config.json 도 한 번 통과시킨다.**
// 소스 쪽 파일이 깨지면 빌드 전에 여기서 먼저 실패한다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { checkDeployConfig } from "../deploy-config.mjs";

const ROOT = resolve(import.meta.dirname, "..", "..", "..");
const REAL = readFileSync(resolve(ROOT, "public", "staticwebapp.config.json"), "utf8");

const GOOD = {
  navigationFallback: { rewrite: "/index.html", exclude: ["/assets/*"] },
  routes: [{ route: "/assets/*", headers: { "Cache-Control": "public, max-age=31536000, immutable" } }],
  globalHeaders: { "Cache-Control": "no-cache", "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'" },
};
const withoutKey = (obj, path) => {
  const clone = structuredClone(obj);
  const keys = path.split(".");
  let cur = clone;
  for (const k of keys.slice(0, -1)) cur = cur[k];
  delete cur[keys.at(-1)];
  return clone;
};

describe("배포 설정 게이트", () => {
  it("실제 public/staticwebapp.config.json 이 통과한다", () => {
    expect(checkDeployConfig(REAL)).toEqual({ ok: true, problems: [] });
  });
  it("파일이 없으면 실패한다 — §6-H 의 사고가 바로 이것이다", () => {
    const got = checkDeployConfig(null);
    expect(got.ok).toBe(false);
    expect(got.problems[0]).toMatch(/404/u);
  });
  it("JSON 이 깨지면 실패한다", () => {
    expect(checkDeployConfig("{ nope").ok).toBe(false);
  });
  it("최소 계약을 전부 담으면 통과한다", () => {
    expect(checkDeployConfig(JSON.stringify(GOOD))).toEqual({ ok: true, problems: [] });
  });
  it.each([
    ["navigationFallback", /rewrite/u],
    ["navigationFallback.exclude", /assets/u],
    ["routes", /immutable/u],
    ["globalHeaders.Cache-Control", /no-cache/u],
  ])("%s 가 빠지면 그 사유로 실패한다", (path, pattern) => {
    const got = checkDeployConfig(JSON.stringify(withoutKey(GOOD, path)));
    expect(got.ok).toBe(false);
    expect(got.problems.join("\n")).toMatch(pattern);
  });
  it("CSP 가 인라인 style 을 막으면 실패한다 — Progress 의 width 가 사라진다", () => {
    const bad = structuredClone(GOOD);
    bad.globalHeaders["Content-Security-Policy"] = "default-src 'self'; style-src 'self'";
    expect(checkDeployConfig(JSON.stringify(bad)).problems.join("\n")).toMatch(/unsafe-inline/u);
  });
});
