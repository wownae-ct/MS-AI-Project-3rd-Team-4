#!/usr/bin/env node
// frontend/docs/plan 문서군 정합 점검 — 수명주기 운영 규칙의 기계 검출기.
//
// 왜: 헤더 블록·색인 등재·링크·갱신일은 "사람이 지키기로 약속"만으로는 부패한다(문서 부패).
//     규칙을 README에 적는 것과 별개로, 위반을 검출할 수단을 함께 둔다.
// 실행: node frontend/docs/plan/tools/check-plan-docs.mjs   (저장소 어디서 실행해도 동작 — 자기 위치 기준)
// 종료 코드: 위반 0건이면 0, 하나라도 있으면 1.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLAN_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ARCHIVE_DIR = join(PLAN_DIR, 'archive');
const README = join(PLAN_DIR, 'README.md');

/** 문서 상태 어휘 — README「두 가지 상태를 혼동하지 않는다」의 수명주기 축. 항목 상태(✅🟡🔴⬜📤)와 겹치지 않는다. */
const DOC_STATES = ['📝 초안', '🟢 활성', '⚫ 종결', '🔁 대체됨'];
/** 종결·아카이브 표로 내려가야 하는 상태 */
const CLOSED_STATES = ['⚫ 종결', '🔁 대체됨'];
const TYPES = ['기준', '대장', '플랜', '실행 기준', '운영'];

const problems = [];
const notes = [];
const fail = (file, msg) => problems.push(`${file}: ${msg}`);
const note = (file, msg) => notes.push(`${file}: ${msg}`);

/** NN_제목.md 형태의 plan 문서만 대상 — README·tools는 색인·도구라 헤더 블록 대상이 아니다. */
const isPlanDoc = (name) => /^\d{2}_.+\.md$/.test(name);
const listDocs = (dir) => (existsSync(dir) ? readdirSync(dir).filter(isPlanDoc).sort() : []);

const activeDocs = listDocs(PLAN_DIR);
const archivedDocs = listDocs(ARCHIVE_DIR);

// ─────────────────────────────────────────────────────────────
// 1·2. 헤더 블록 존재·필드 4종·상태 어휘
// ─────────────────────────────────────────────────────────────
/** 제목 다음의 첫 인용 줄을 헤더 블록으로 본다 (06처럼 인용이 여러 줄이어도 첫 줄만이 표준 블록). */
const HEADER_RE =
  /^>\s*\*\*유형\*\*\s*(.+?)\s*·\s*\*\*문서 상태\*\*\s*(.+?)\s*·\s*\*\*최종 갱신\*\*\s*(\d{4}-\d{2}-\d{2})\s*·\s*\*\*종결 조건\*\*\s*(.+?)\s*$/;

/** @type {Map<string, {state: string, updated: string, archived: boolean}>} */
const headers = new Map();

for (const { name, dir, archived } of [
  ...activeDocs.map((name) => ({ name, dir: PLAN_DIR, archived: false })),
  ...archivedDocs.map((name) => ({ name, dir: ARCHIVE_DIR, archived: true })),
]) {
  const path = join(dir, name);
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  const titleIdx = lines.findIndex((l) => l.startsWith('# '));
  if (titleIdx < 0) {
    fail(name, '제목(`# …`)이 없다');
    continue;
  }
  const headerLine = lines.slice(titleIdx + 1).find((l) => l.trim() !== '');
  const m = headerLine?.match(HEADER_RE);
  if (!m) {
    fail(name, '헤더 표준 블록 없음/형식 불일치 — `> **유형** … · **문서 상태** … · **최종 갱신** YYYY-MM-DD · **종결 조건** …`');
    continue;
  }
  const [, type, state, updated, closeCond] = m;
  if (!TYPES.includes(type)) fail(name, `알 수 없는 유형 "${type}" (허용: ${TYPES.join(' · ')})`);
  if (!DOC_STATES.includes(state)) fail(name, `알 수 없는 문서 상태 "${state}" (허용: ${DOC_STATES.join(' · ')})`);
  if (!closeCond || closeCond.length < 2) fail(name, '종결 조건이 비어 있다 — 검증 가능한 문장으로 채운다');
  headers.set(name, { state, updated, archived });
}

// ─────────────────────────────────────────────────────────────
// 3. 헤더 최종 갱신일 ↔ git 최종 수정일 대조 (부패 검출)
// ─────────────────────────────────────────────────────────────
const gitDate = (path) => {
  try {
    // %cs = 커밋 날짜 YYYY-MM-DD. 미커밋 파일은 빈 문자열.
    return execFileSync('git', ['log', '-1', '--format=%cs', '--', path], {
      cwd: PLAN_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return ''; // git 없음/저장소 아님 — 이 검사만 건너뛴다
  }
};
const isDirty = (path) => {
  try {
    return (
      execFileSync('git', ['status', '--porcelain', '--', path], {
        cwd: PLAN_DIR,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() !== ''
    );
  } catch {
    return false;
  }
};

for (const [name, h] of headers) {
  const path = join(h.archived ? ARCHIVE_DIR : PLAN_DIR, name);
  const committed = gitDate(path);
  if (!committed) {
    note(name, '아직 커밋되지 않음 — 갱신일 대조 생략');
    continue;
  }
  if (h.updated < committed) {
    fail(name, `헤더 최종 갱신(${h.updated})이 git 최종 수정(${committed})보다 과거 — 본문만 고치고 헤더를 안 고쳤다`);
  } else if (h.updated > committed && !isDirty(path)) {
    note(name, `헤더 갱신일(${h.updated})이 git 최종 수정(${committed})보다 미래인데 작업 트리는 깨끗하다 — 날짜 오기 가능성`);
  }
}

// ─────────────────────────────────────────────────────────────
// 4. 상대 링크 대상 실존
// ─────────────────────────────────────────────────────────────
const LINK_RE = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
/**
 * 코드 펜스와 인라인 코드 스팬을 걷어낸다.
 * 왜: 이 문서군은 마크다운 서식 자체를 예시로 싣는다(헤더 블록 예시·`[후속 문서](링크)` 같은 표기 설명).
 *     예시를 실제 링크로 오인하면 검사기가 문서 표현을 제약하게 된다 — 검사기가 문서에 맞춰야 한다.
 */
const stripCode = (md) => md.replace(/^```[\s\S]*?^```/gm, '').replace(/`[^`\n]*`/g, '');

/**
 * GitHub 헤딩 슬러그 규칙 근사: 소문자화 → 문자·숫자·공백·하이픈 외 제거 → 공백을 하이픈으로.
 *
 * 주의(실측으로 교정한 함정): 공백은 **개별로** 하이픈이 된다 — `\s+` 축약이 아니다.
 * 예) `… 기록 (v1.1 — 2026-08-17)` 은 문장부호가 사라지며 공백이 2개 남아 `…-기록-v11--2026-08-17`(하이픈 2개)이 된다.
 * 축약 구현은 실제로는 멀쩡한 앵커를 깨졌다고 보고했다.
 * (동일 제목 중복 시 붙는 `-1` 접미사는 이 문서군에 없으므로 다루지 않는다.)
 */
const slugify = (heading) =>
  heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s/g, '-');

const anchorCache = new Map();
const anchorsOf = (absPath) => {
  if (!anchorCache.has(absPath)) {
    const headings = stripCode(readFileSync(absPath, 'utf8'))
      .split(/\r?\n/)
      .filter((l) => /^#{1,6}\s+/.test(l))
      .map((l) => slugify(l.replace(/^#{1,6}\s+/, '')));
    anchorCache.set(absPath, new Set(headings));
  }
  return anchorCache.get(absPath);
};

const checkLinks = (path, name) => {
  const body = stripCode(readFileSync(path, 'utf8'));
  for (const m of body.matchAll(LINK_RE)) {
    const raw = m[1];
    if (/^(https?:|mailto:)/.test(raw)) continue; // 외부 링크는 대상 아님
    const [target, anchor] = raw.split('#');
    const abs = target ? resolve(dirname(path), decodeURIComponent(target)) : path;
    if (!existsSync(abs)) {
      fail(name, `깨진 상대 링크 → ${raw}`);
      continue;
    }
    // 앵커 검증: 링크 부패는 파일보다 앵커에서 더 자주 난다(제목만 바꾸는 개정).
    if (anchor && abs.endsWith('.md') && !anchorsOf(abs).has(decodeURIComponent(anchor))) {
      fail(name, `깨진 앵커 → ${raw} (대상 문서에 해당 제목 없음)`);
    }
  }
};
for (const name of activeDocs) checkLinks(join(PLAN_DIR, name), name);
for (const name of archivedDocs) checkLinks(join(ARCHIVE_DIR, name), `archive/${name}`);
checkLinks(README, 'README.md');

// ─────────────────────────────────────────────────────────────
// 5·6. README 색인 ↔ 실제 파일 · 종결 문서의 활성 표 잔류
// ─────────────────────────────────────────────────────────────
const readme = readFileSync(README, 'utf8');
/** 색인 절을 헤딩으로 잘라 활성/종결 구간을 나눈다. */
const sliceSection = (start, end) => {
  const s = readme.indexOf(start);
  if (s < 0) return '';
  const e = end ? readme.indexOf(end, s + start.length) : -1;
  return readme.slice(s, e < 0 ? undefined : e);
};
const activeSection = sliceSection('### 활성', '### 종결');
const closedSection = sliceSection('### 종결', '### 도구');

if (!activeSection) fail('README.md', '색인의 `### 활성` 절을 찾을 수 없다');
if (!closedSection) fail('README.md', '색인의 `### 종결` 절을 찾을 수 없다');

const listedIn = (section) =>
  new Set([...section.matchAll(/\((?:archive\/)?(\d{2}_[^)#]+\.md)\)/g)].map((m) => m[1]));
const listedActive = listedIn(activeSection);
const listedClosed = listedIn(closedSection);

for (const name of activeDocs) {
  const state = headers.get(name)?.state;
  const closed = state && CLOSED_STATES.includes(state);
  if (closed) {
    if (listedActive.has(name)) fail(name, `문서 상태가 "${state}"인데 README 활성 표에 남아 있다 — 종결 체크리스트 4단계 누락`);
    if (!listedClosed.has(name)) fail(name, `문서 상태가 "${state}"인데 README 종결·아카이브 표에 없다`);
  } else if (!listedActive.has(name)) {
    fail(name, 'README 활성 색인에 등재되지 않았다 — 신설 규칙 위반(같은 PR에서 등재)');
  }
}
for (const name of archivedDocs) {
  if (listedActive.has(name)) fail(`archive/${name}`, '아카이브된 문서가 README 활성 표에 있다');
  if (!listedClosed.has(name)) fail(`archive/${name}`, 'README 종결·아카이브 표에 등재되지 않았다');
  const state = headers.get(name)?.state;
  if (state && !CLOSED_STATES.includes(state)) fail(`archive/${name}`, `아카이브 문서의 상태가 "${state}" — 종결/대체됨이어야 한다`);
}
for (const listed of listedActive) {
  if (!activeDocs.includes(listed)) fail('README.md', `활성 색인에 유령 행: ${listed} (실제 파일 없음)`);
}

// 상위 docs/README 등재 여부 (같은 PR 등재 규칙 — 활성 문서만)
const PARENT_README = resolve(PLAN_DIR, '..', 'README.md');
if (existsSync(PARENT_README)) {
  const parent = readFileSync(PARENT_README, 'utf8');
  for (const name of activeDocs) {
    const state = headers.get(name)?.state;
    if (state && CLOSED_STATES.includes(state)) continue;
    if (!parent.includes(name)) fail(name, '상위 docs/README 색인에 등재되지 않았다');
  }
}

// ─────────────────────────────────────────────────────────────
// 보고
// ─────────────────────────────────────────────────────────────
const scanned = activeDocs.length + archivedDocs.length;
console.log(`plan 문서 점검 — 활성 ${activeDocs.length} · 아카이브 ${archivedDocs.length} (총 ${scanned})`);
for (const n of notes) console.log(`  · 참고 ${n}`);
if (problems.length === 0) {
  console.log('✅ 위반 0건 — 헤더 블록 · 갱신일 · 링크 · 색인 정합 전부 통과');
  process.exit(0);
}
console.error(`\n❌ 위반 ${problems.length}건`);
for (const p of problems) console.error(`  - ${p}`);
process.exit(1);
