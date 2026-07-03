#!/usr/bin/env node
// scripts/check-goal-88.mjs — 자동 생성 (vhk goal sync).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 88 gate.')
  process.exit(1)
}

// BOM-safe 읽기: PowerShell Set-Content -Encoding utf8 의 UTF-8 BOM 제거(없으면 throw).
const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 88] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 88 고유 검증 (직접 추가) ───────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null

const docsReadmeTs = read('src/templates/docs-readme.ts')
must(
  docsReadmeTs?.includes('RFC_README_TEMPLATE') && docsReadmeTs?.includes('PATTERNS_README_TEMPLATE'),
  'docs-readme.ts 에 RFC_README_TEMPLATE·PATTERNS_README_TEMPLATE 존재'
)

const initTs = read('src/commands/init.ts')
must(
  initTs?.includes("'docs/rfc/README.md': RFC_README_TEMPLATE()") &&
    initTs?.includes("'docs/patterns/README.md': PATTERNS_README_TEMPLATE()"),
  'init.ts generateFiles() 가 rfc/patterns README 를 산출물에 배선'
)

const startTs = read('src/commands/start.ts')
must(startTs?.includes('ko.start.goalInitHint'), 'start.ts 완료 안내에 goalInitHint 출력')
must(!startTs?.includes('goalInit('), 'start.ts 가 goalInit() 을 직접 호출하지 않음 (자동실행 금지 회귀가드)')

const initTest = read('tests/init.test.ts')
must(
  initTest?.includes("'docs/rfc/README.md'") && initTest?.includes("'docs/patterns/README.md'"),
  'init.test.ts EXPECTED_FILES 에 rfc/patterns README 경로 포함'
)

const startTest = read('tests/start.test.ts')
must(startTest?.includes('vhk goal init'), 'start.test.ts 가 goalInit 힌트 노출을 검증')
must(
  startTest?.includes("goals', '_meta.md'") || startTest?.includes('goals/_meta.md'),
  'start.test.ts 가 goal init 미자동실행(goals/_meta.md 미생성)을 회귀가드로 검증'
)

if (pass) { console.log('✅ goal 88 gate passes'); process.exit(0) }
console.log('❌ goal 88 gate failed'); process.exit(1)
