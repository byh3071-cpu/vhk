#!/usr/bin/env node
// scripts/check-goal-83.mjs — goal 83: 보안 scan 테스트 픽스처 false positive (tests/** MEDIUM→INFO 강등).
// 기본 게이트 = typecheck + (lint) + test + build. goal 고유 검증은 아래 구역.
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
    execFileSync(bin, argv, { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })
    return true
  } catch (e) {
    const out = (e?.stdout?.toString() ?? '') + (e?.stderr?.toString() ?? '')
    if (out.trim()) console.log(out.split('\n').slice(-25).join('\n'))
    return false
  }
}

if (existsSync('.vhk/HARD_STOP')) {
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 83 gate.')
  process.exit(1)
}

const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 83] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 83 고유 검증 ───────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
const pat = read('src/lib/secret-patterns.ts') ?? ''
must(/SecretSeverity = 'critical' \| 'high' \| 'medium' \| 'info'/.test(pat), "SecretSeverity 에 'info' 추가(강등 대상)")

const scan = read('src/lib/scan-secrets.ts') ?? ''
must(/export function isTestFixturePath/.test(scan), 'isTestFixturePath() export(픽스처 경로 식별)')
must(/export function downgradeTestFixtureFindings/.test(scan), 'downgradeTestFixtureFindings() export(MEDIUM→INFO 강등)')
// 강등은 medium 한정 — critical/high 약화 금지(Forbidden).
must(/f\.severity === 'medium' && isTestFixturePath/.test(scan), '강등 조건 = medium + 픽스처 경로만(critical/high 위치무관 유지)')
must(/filterSevereFindings[\s\S]*'critical' \|\| f\.severity === 'high'/.test(scan), 'filterSevereFindings 불변(critical/high — 게이팅 영향 0)')

const sec = read('src/commands/secure.ts') ?? ''
must(/downgradeTestFixtureFindings\(scan\.findings\)/.test(sec), 'secure.ts 가 강등 적용')
must(/severity === 'info'/.test(sec) && /테스트 픽스처/.test(sec), 'secure.ts INFO 그룹 렌더("테스트 픽스처 — 유출 아님")')

const t = read('tests/scan-secrets.test.ts') ?? ''
must(/Goal 83 — 테스트 픽스처 false positive 강등/.test(t), '회귀 테스트 describe(Goal 83)')
must(/severity\)\.toBe\('info'\)/.test(t), '테스트: tests/** MEDIUM → info')
must(/aws-access-key'\)\?\.severity\)\.toBe\('critical'\)/.test(t), '테스트: tests/** CRITICAL 유지(약화 금지)')

const goal = read('goals/83-secure-fixture-allowlist.md') ?? ''
must(/status:\s*DONE/.test(goal), 'goals/83 status DONE')

if (pass) { console.log('✅ goal 83 gate passes'); process.exit(0) }
console.log('❌ goal 83 gate failed'); process.exit(1)
