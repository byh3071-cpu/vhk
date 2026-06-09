#!/usr/bin/env node
// scripts/check-goal-57.mjs — Goal 57: 위험 정책 글롭 확장(risk-policy-glob).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 57 gate.')
  process.exit(1)
}

const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 57] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 57 고유 검증 (위험 정책 글롭 확장 — 단일 소스 유지) ───────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null

// 1) risk-policy: isRiskyTarget + RISKY_TARGET_PATTERNS + resolveGuard 4번째 인자(target?).
const policy = read('src/lib/risk-policy.ts') ?? ''
must(/export function isRiskyTarget\b/.test(policy), 'risk-policy: isRiskyTarget export')
must(/export const RISKY_TARGET_PATTERNS\b/.test(policy), 'risk-policy: RISKY_TARGET_PATTERNS export')
must(/export function resolveGuard\([^)]*target\?: string\)/.test(policy), 'risk-policy: resolveGuard(…, target?: string) 4-arg')
must(/target !== undefined && isRiskyTarget\(target\)\.risky/.test(policy), 'risk-policy: resolveGuard 가 target 글롭 평가')

// 2) safety-guard: GuardDeps.target + runGuarded 가 deps.target 전달.
const guard = read('src/lib/safety-guard.ts') ?? ''
must(/target\?: string/.test(guard), 'safety-guard: GuardDeps.target optional')
must(/resolveGuard\(action, mode, deps\.channel, deps\.target\)/.test(guard), 'safety-guard: resolveGuard 에 deps.target 전달')

// 3) 단일 소스(part 2 보수) — 분산 결정점이 위험대상 정책을 재정의(shadow)하지 않음.
//    grep 중복 0 가정: 억지 일원화 금지, 재정의 0 만 단언(드리프트 가드).
for (const f of ['src/lib/hard-stop-guard.ts', 'src/lib/preflight.ts', 'src/commands/preflight.ts', 'src/commands/secure.ts', 'src/commands/mission.ts']) {
  const src = read(f)
  if (src == null) continue
  must(!/RISKY_TARGET_PATTERNS\s*[=:]/.test(src) && !/function isRiskyTarget\b/.test(src), `${f}: 위험대상 정책 재정의 0(단일 소스 유지)`)
}

// 4) 회귀 테스트 존재(글롭 매핑 + 기존 9종 회귀 0 + 단일성 가드).
must(existsSync('tests/risk-glob.test.ts'), 'tests/risk-glob.test.ts 존재')

if (pass) { console.log('✅ goal 57 gate passes'); process.exit(0) }
console.log('❌ goal 57 gate failed'); process.exit(1)
