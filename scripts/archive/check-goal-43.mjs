#!/usr/bin/env node
// scripts/check-goal-43.mjs — 자동 생성(vhk goal sync) 후 goal 고유 검증 손추가.
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 43 gate.')
  process.exit(1)
}

const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 43] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 43 고유 검증 (goal 상태↔코드 드리프트 게이트) ───────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
// 순수 감지 lib
const drift = read('src/lib/goal-drift.ts') ?? ''
must(drift !== '', 'src/lib/goal-drift.ts 존재')
must(/export function hasCustomGateAssertions/.test(drift), 'hasCustomGateAssertions export')
must(/export function findStatusDriftCandidates/.test(drift), 'findStatusDriftCandidates export')
must(!/execSync/.test(drift), 'goal-drift.ts execSync 없음(순수)')
must(!/JSON\.parse\(\s*(?:fs\.)?readFileSync/.test(drift), 'goal-drift.ts raw JSON.parse(readFileSync) 없음')
// CLI 명령
const goal = read('src/commands/goal.ts') ?? ''
must(/export async function goalDrift/.test(goal), 'goal.ts goalDrift export')
must(/findStatusDriftCandidates/.test(goal), 'goal.ts 가 findStatusDriftCandidates 사용')
must(/ensureNotHardStopped/.test(goal) ? !/goalDrift[\s\S]*?ensureNotHardStopped/.test(goal.slice(goal.indexOf('export async function goalDrift'), goal.indexOf('export async function goalDone'))) : true, 'goalDrift 는 HARD_STOP 가드 없음(read-only)')
// 등록·발견성
must(/'drift'/.test(read('src/lib/command-registry.ts') ?? ''), "command-registry 에 'drift' 등록")
const idx = read('src/index.ts') ?? ''
must(/\.command\('drift'\)/.test(idx), "index.ts 에 goal drift 서브커맨드 등록")
must(/goalDrift/.test(idx), 'index.ts 가 goalDrift import·호출')
// i18n
must(/driftTitle/.test(read('src/i18n/ko.ts') ?? ''), 'ko.ts 에 goal.driftTitle 메시지')
// 회귀 테스트
must(existsSync('tests/goal-drift.test.ts'), 'tests/goal-drift.test.ts 존재')

if (pass) { console.log('✅ goal 43 gate passes'); process.exit(0) }
console.log('❌ goal 43 gate failed'); process.exit(1)
