#!/usr/bin/env node
// scripts/check-goal-55.mjs — Goal 55: AI 행동 원장(agent-action-ledger).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 55 gate.')
  process.exit(1)
}

const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 55] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 55 고유 검증 (AI 행동 원장) ───────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null

// 1) action-ledger 신설 — evidence-ledger 패턴 재사용(atomicWriteFile + stripBom), 경로/타입/exports.
const ledger = read('src/lib/action-ledger.ts') ?? ''
must(ledger.length > 0, 'src/lib/action-ledger.ts 존재')
must(/ACTION_LEDGER_PATH_REL/.test(ledger) && /ai-actions\.jsonl/.test(ledger) && /'events'/.test(ledger),
  'action-ledger: .vhk/events/ai-actions.jsonl 경로')
must(/export interface AiActionEntry/.test(ledger), 'action-ledger: AiActionEntry 인터페이스')
for (const field of ['ts', 'action', 'channel', 'guard', 'ran', 'reason']) {
  must(new RegExp('\\b' + field + '[\\?]?:').test(ledger), `AiActionEntry 필드: ${field}`)
}
for (const fn of ['readActionLedger', 'appendActionEntry']) {
  must(new RegExp('export function ' + fn + '\\b').test(ledger), `action-ledger export: ${fn}`)
}
must(/appendFileSync/.test(ledger), 'action-ledger: appendFileSync(O(1) append, 동시 lost-update·O(n²) 회피)')
must(/stripBom/.test(ledger), 'action-ledger: stripBom(BOM-safe 읽기)')

// 2) safety-guard: runGuarded 얇은 래핑 + appendActionEntry hook(chokepoint 일원 기록).
const guard = read('src/lib/safety-guard.ts') ?? ''
must(/runGuardedInner\b/.test(guard), 'safety-guard: runGuarded 얇은 래핑(runGuardedInner)')
must(/appendActionEntry\(/.test(guard), 'safety-guard: appendActionEntry 기록 hook')
must(/deps\.cwd \?\? process\.cwd\(\)/.test(guard), 'safety-guard: 기록 경로 deps.cwd ?? process.cwd()')
must(/target: deps\.target/.test(guard), 'safety-guard: 행동원장에 deps.target 기록(goal 57 plumbing 통합)')

// 3) hard-stop-guard: 트립와이어 차단도 행동 이벤트로 기록.
const hardStop = read('src/lib/hard-stop-guard.ts') ?? ''
must(/appendActionEntry\(/.test(hardStop), 'hard-stop-guard: 차단 시 appendActionEntry')
must(/'hardstop'/.test(hardStop) && /'hard-stop'/.test(hardStop), "hard-stop-guard: channel/guard 'hardstop' + reason 'hard-stop'")

// 4) raw JSON.parse(readFileSync) 0건(BOM 안전) — 별도 게이트 동시 통과.
must(run('node', ['scripts/check-no-raw-json-parse.mjs']), 'check-no-raw-json-parse.mjs 통과(raw JSON.parse 0)')

// 5) 회귀 테스트 존재.
must(existsSync('tests/action-ledger.test.ts'), 'tests/action-ledger.test.ts 존재')

if (pass) { console.log('✅ goal 55 gate passes'); process.exit(0) }
console.log('❌ goal 55 gate failed'); process.exit(1)
