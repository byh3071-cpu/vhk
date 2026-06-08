#!/usr/bin/env node
// scripts/check-goal-42.mjs — 자동 생성(vhk goal sync) 후 goal 고유 검증 손추가.
// 기본 게이트 = typecheck + (lint) + test + build. goal 고유 검증은 아래 구역.
//
// Env: VHK_GATES_SKIP_DEEP=1  → test + build 스킵 (빠른 typecheck-only 패스)

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const SHIM = new Set(['pnpm', 'npm', 'npx', 'yarn'])
function run(cmd, args) {
  let bin = cmd, argv = args
  if (process.platform === 'win32' && SHIM.has(cmd)) {
    bin = 'cmd.exe'; argv = ['/d', '/s', '/c', cmd + '.cmd', ...args]
  }
  try {
    execFileSync(bin, argv, { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })
    return true
  } catch (e) {
    const out = (e?.stdout?.toString() ?? '') + (e?.stderr?.toString() ?? '')
    if (out.trim()) console.log(out.split('\n').slice(-25).join('\n'))
    return false
  }
}

if (existsSync('.vhk/HARD_STOP')) {
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 42 gate.')
  process.exit(1)
}

const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 42] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
const must = (cond, label) => { console.log((cond ? '    ✓ ' : '    ✗ ') + label); if (!cond) pass = false }

if (scripts.typecheck) gate('typecheck', run(pm, ['run', 'typecheck']))
else if (existsSync('tsconfig.json')) gate('tsc --noEmit', run(pm, pm === 'npm' ? ['exec', '--', 'tsc', '--noEmit'] : ['exec', 'tsc', '--noEmit']))
if (scripts.lint) gate('lint', run(pm, ['run', 'lint']))
if (!skipDeep) {
  if (scripts['test:run']) gate('test', run(pm, ['run', 'test:run']))
  else if (scripts.test && /vitest/.test(scripts.test)) gate('test', run(pm, ['run', 'test', '--', '--run']))
  else if (scripts.test) gate('test', run(pm, ['run', 'test']))
  if (scripts.build) gate('build', run(pm, ['run', 'build']))
}

// ─── goal 42 고유 검증 (릴리즈 준비 게이트) ─────────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
const rr = read('src/lib/release-readiness.ts') ?? ''
must(rr !== '', 'src/lib/release-readiness.ts 존재')
must(/export function parseReleasedSections/.test(rr), 'parseReleasedSections export')
must(/export function isPlaceholderBody/.test(rr), 'isPlaceholderBody export')
must(/export function findEmptyReleasedSections/.test(rr), 'findEmptyReleasedSections export')
must(/export function checkReleaseReadiness/.test(rr), 'checkReleaseReadiness export')
must(/PLACEHOLDER_RE/.test(rr), 'placeholder 패턴(작성 필요 등) 탐지 상수')
must(!/execSync/.test(rr), 'release-readiness.ts execSync 없음(순수)')
must(!/JSON\.parse\(\s*(?:fs\.)?readFileSync/.test(rr), 'release-readiness.ts raw JSON.parse 없음')
// publish 전 게이트 배선
const pub = read('src/commands/publish.ts') ?? ''
must(/checkReleaseReadiness/.test(pub), 'publish.ts 가 checkReleaseReadiness 호출(발행 전 차단)')
must(/릴리즈 준비 미완|readiness\.ok/.test(pub), 'publish 가 미충족 시 발행 차단')
// 회귀 테스트(빈 본문 케이스 + 실제 repo 가드)
const test = read('tests/release-readiness.test.ts') ?? ''
must(test !== '', 'tests/release-readiness.test.ts 존재')
must(/CHANGELOG\.md/.test(test), '실제 repo CHANGELOG 회귀 가드 포함')
must(/findEmptyReleasedSections|placeholder/i.test(test), '빈/placeholder 본문 케이스 테스트')

if (pass) { console.log('✅ goal 42 gate passes'); process.exit(0) }
console.log('❌ goal 42 gate failed'); process.exit(1)
