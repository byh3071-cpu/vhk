#!/usr/bin/env node
// scripts/check-goal-28.mjs — 자동 생성(vhk goal sync) 후 goal 고유 검증 손추가.
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 28 gate.')
  process.exit(1)
}

const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 28] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 28 고유 검증 (test-first 매핑 게이트) ─────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
const map = read('src/lib/test-mapping.ts') ?? ''
must(/export function isFeatureSource/.test(map), 'test-mapping.ts isFeatureSource export')
must(/export function expectedTestBasename/.test(map), 'expectedTestBasename export')
must(/export function findUntested/.test(map), 'findUntested export')
must(/export function collectTestBasenames/.test(map), 'collectTestBasenames export')
const cmd = read('src/commands/testmap.ts') ?? ''
must(/export async function testmap/.test(cmd), 'testmap.ts testmap export')
must(/export function changedFeatureSources/.test(cmd), 'changedFeatureSources export')
must(/VHK_TEST_FIRST/.test(cmd), 'opt-in VHK_TEST_FIRST 플래그')
must(/process\.exitCode = 1/.test(cmd), 'HARD 모드에서 exit 1')
must(/gitOut/.test(cmd) && !/execSync/.test(cmd), 'testmap 이 gitOut 통로 사용(새 execSync 없음)')
must(!/ensureNotHardStopped/.test(cmd), 'testmap 은 read-only(HARD_STOP 가드 없음)')
// 등록·발견성
must(/\.command\('testmap'\)/.test(read('src/index.ts') ?? ''), "index.ts 에 testmap 등록")
must(/name: 'testmap'/.test(read('src/lib/command-registry.ts') ?? ''), 'TOP_LEVEL_COMMANDS 에 testmap')
// _meta 강화
must(/testmap/.test(read('goals/_meta.md') ?? '') && /VHK_TEST_FIRST/.test(read('goals/_meta.md') ?? ''), '_meta.md 테스트 게이트에 testmap 반영')
// 회귀 테스트
must(existsSync('tests/test-mapping.test.ts'), 'tests/test-mapping.test.ts 존재')

if (pass) { console.log('✅ goal 28 gate passes'); process.exit(0) }
console.log('❌ goal 28 gate failed'); process.exit(1)
