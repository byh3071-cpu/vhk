#!/usr/bin/env node
// scripts/check-goal-81.mjs — goal 81: 제품 설명 단일 SoT (index.ts .description → package.json.description 주입).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 81 gate.')
  process.exit(1)
}

const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 81] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 81 고유 검증 ───────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
const v = read('src/lib/version.ts') ?? ''
must(/export function getVhkDescription\(\): string/.test(v), 'version.ts getVhkDescription() export(런타임 주입 통로)')
must(/pkg\.description/.test(v), 'getVhkDescription 가 package.json.description 읽음')

const idx = read('src/index.ts') ?? ''
must(/getVhkVersion, getVhkDescription/.test(idx) || /getVhkDescription/.test(idx), 'index.ts getVhkDescription import')
must(/\.description\(getVhkDescription\(\)\)/.test(idx), 'index.ts .description 가 런타임 주입(하드코딩 복제 제거)')
must(!/\.description\('VHK — AI 코딩 세션을/.test(idx), 'index.ts 제품 설명 하드코딩 리터럴 0(드리프트 원천 차단)')
must(/브랜드 태그라인/.test(idx), '메뉴 헤더 태그라인 의도 명문화(태그라인 ≠ 제품 설명)')

const t = read('tests/version-sync.test.ts') ?? ''
must(/제품 설명 정합 — package\.json ↔ index\.ts \(Goal 81\)/.test(t), '회귀 테스트 describe(제품 설명 정합)')
must(/getVhkDescription\(\)\)\.toBe\(pkg\.description\)/.test(t), '테스트: getVhkDescription == package.json.description')
must(/\.not\.toMatch\(\/\\\.description\\\('VHK — AI 코딩 세션을/.test(t), '테스트: index.ts 하드코딩 복제 금지 가드')

// 제품 설명 SoT 실제 정합(빌드 산출물 기준은 아니나, 소스 단에서 SoT 일치 확인)
must(typeof pkg.description === 'string' && pkg.description.length > 0, 'package.json.description 존재(SoT)')

const goal = read('goals/81-product-desc-sot.md') ?? ''
must(/status:\s*DONE/.test(goal), 'goals/81 status DONE')

if (pass) { console.log('✅ goal 81 gate passes'); process.exit(0) }
console.log('❌ goal 81 gate failed'); process.exit(1)
