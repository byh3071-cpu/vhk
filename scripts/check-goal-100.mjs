#!/usr/bin/env node
// scripts/check-goal-100.mjs — 자동 생성 (vhk goal sync).
// 기본 게이트 = typecheck + (lint) + test + build. goal 고유 검증은 아래 구역에 추가.
// sync 재실행해도 기존 파일은 덮어쓰지 않습니다 (idempotent).
//
// Env: VHK_GATES_SKIP_DEEP=1  → test + build 스킵 (빠른 typecheck-only 패스)

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const SHIM = new Set(['pnpm', 'npm', 'npx', 'yarn'])
function run(cmd, args) {
  let bin = cmd, argv = args
  if (process.platform === 'win32' && SHIM.has(cmd)) {
    // Windows: .cmd shim 직접 spawn 은 Node CVE-2024-27980 으로 EINVAL → cmd.exe 래핑.
    bin = 'cmd.exe'; argv = ['/d', '/s', '/c', cmd + '.cmd', ...args]
  }
  try {
    // maxBuffer 상향: 큰 빌드/테스트 로그(>1MB)에서 성공해도 ENOBUFS 거짓실패 방지.
    execFileSync(bin, argv, { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })
    return true
  } catch (e) {
    const out = (e?.stdout?.toString() ?? '') + (e?.stderr?.toString() ?? '')
    if (out.trim()) console.log(out.split('\n').slice(-25).join('\n'))
    return false
  }
}

if (existsSync('.vhk/HARD_STOP')) {
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 100 gate.')
  process.exit(1)
}

// BOM-safe 읽기: PowerShell Set-Content -Encoding utf8 의 UTF-8 BOM 제거(없으면 throw).
const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 100] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
const must = (cond, label) => { console.log((cond ? '    ✓ ' : '    ✗ ') + label); if (!cond) pass = false }

// typecheck (스크립트 우선, 없으면 tsc --noEmit)
if (scripts.typecheck) gate('typecheck', run(pm, ['run', 'typecheck']))
else if (existsSync('tsconfig.json')) gate('tsc --noEmit', run(pm, pm === 'npm' ? ['exec', '--', 'tsc', '--noEmit'] : ['exec', 'tsc', '--noEmit']))
if (scripts.lint) gate('lint', run(pm, ['run', 'lint']))
if (!skipDeep) {
  if (scripts['test:run']) gate('test', run(pm, ['run', 'test:run']))
  else if (scripts.test && /vitest/.test(scripts.test)) gate('test', run(pm, ['run', 'test', '--', '--run']))
  else if (scripts.test) gate('test', run(pm, ['run', 'test']))
  if (scripts.build) gate('build', run(pm, ['run', 'build']))
}

// ─── goal 100 고유 검증 (직접 추가) ───────────────────────────────
// cold-start 역채굴: memory.patterns=0 → evolveSuggest 가 죽는 문제(evolve.ts:evolveSuggest
// 📭 조기 return)를 vhk evolve seed 로 해소하는지. seed-mine.ts 토대 + evolve.ts 배선 +
// 4지점 등록(nlp-router/MCP 는 의도적 생략, goal 99 선례) + 테스트 존재를 문자열로 확인.
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null

// 1) seed-mine.ts — 토대. SeedCandidate + 4개 순수 함수.
const seedMineTs = read('src/lib/seed-mine.ts')
must(seedMineTs?.includes('export interface SeedCandidate'), 'seed-mine.ts 가 SeedCandidate export')
must(seedMineTs?.includes('export function parsePatMarkdown'), 'seed-mine.ts 가 parsePatMarkdown() export')
must(seedMineTs?.includes('export function failureToSeed'), 'seed-mine.ts 가 failureToSeed() export')
must(seedMineTs?.includes('export function tsToSeed'), 'seed-mine.ts 가 tsToSeed() export')
must(seedMineTs?.includes('export function renderSeedPreview'), 'seed-mine.ts 가 renderSeedPreview() export')
must(!/from ['"]\.\.\/commands\//.test(seedMineTs ?? ''), 'seed-mine.ts 가 commands/ 를 import 하지 않음(순환 방지, lib 전용 의존)')

// 2) evolve.ts — evolveSeed() CLI 레이어. dry-run(기본)/--write 분기 + reconcilePatterns 재사용.
const evolveTs = read('src/commands/evolve.ts')
must(evolveTs?.includes('export async function evolveSeed'), 'evolve.ts 가 evolveSeed() export')
must(evolveTs?.includes('reconcilePatterns(mem.patterns'), 'evolveSeed 가 reconcilePatterns 재사용(--write 경로, 새 상태쓰기 코드 0)')
must(evolveTs?.includes('SEED_CANDIDATES_PATH'), 'evolveSeed 가 .vhk/seed-candidates.md 미리보기 경로 상수 사용')
must(/if \(!opts\.write\)/.test(evolveTs ?? ''), 'evolveSeed 가 dry-run(기본)/--write 를 분기(안전 기본값)')

// 3) index.ts — 커맨드 등록(영문+한글 별칭) + 옵션.
const indexTs = read('src/index.ts')
must(indexTs?.includes("command('seed')"), "index.ts 가 evolve 하위 'seed' 커맨드 등록")
must(indexTs?.includes("alias('씨앗')"), "index.ts 가 '씨앗' 한글 별칭 등록")
must(indexTs?.includes("evolveSeed(opts)"), 'index.ts seed 액션이 evolveSeed(opts) 호출')
must(indexTs?.includes("'--write'"), "index.ts 가 --write 옵션 등록")

// 4) command-registry.ts — evolve leaf 배열에 seed 등재(registry-drift 테스트 강제 대상).
const registryTs = read('src/lib/command-registry.ts')
must(/evolve:\s*\[[^\]]*'seed'/.test(registryTs ?? ''), "command-registry.ts evolve leaf 배열에 'seed' 등재")

// 5) ko.ts — evolve.seedPreviewTitle/seedWriteTitle.
const koTs = read('src/i18n/ko.ts')
must(koTs?.includes('seedPreviewTitle'), 'ko.ts evolve 블록에 seedPreviewTitle 존재')
must(koTs?.includes('seedWriteTitle'), 'ko.ts evolve 블록에 seedWriteTitle 존재')

// 6) .vhk/.gitignore — seed-candidates.md 대칭 추가(negative-candidates.md 와 동일 로컬 전용).
const vhkGitignore = read('.vhk/.gitignore')
must(vhkGitignore?.includes('seed-candidates.md'), '.vhk/.gitignore 가 seed-candidates.md 제외(로컬 전용 미리보기)')

// 7) COMMANDS.md — 카탈로그 표 정합.
const commandsMd = read('COMMANDS.md')
must(commandsMd?.includes('vhk evolve seed'), 'COMMANDS.md 카탈로그 표에 vhk evolve seed 행 존재')

// 8) 테스트 파일 존재 + 핵심 케이스 커버.
const seedMineTest = read('tests/seed-mine.test.ts')
must(existsSync('tests/seed-mine.test.ts'), 'tests/seed-mine.test.ts 신규 존재')
must(
  ['parsePatMarkdown', 'failureToSeed', 'tsToSeed', 'renderSeedPreview'].every((fn) => (seedMineTest ?? '').includes(fn)),
  'tests/seed-mine.test.ts 가 4개 함수 전부 커버'
)

if (pass) { console.log('✅ goal 100 gate passes'); process.exit(0) }
console.log('❌ goal 100 gate failed'); process.exit(1)
