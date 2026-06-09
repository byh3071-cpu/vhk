#!/usr/bin/env node
// scripts/check-goal-56.mjs — Goal 56: 비용·예산 가드(cost-guard).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 56 gate.')
  process.exit(1)
}

const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 56] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 56 고유 검증 (비용·예산 가드) ───────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null

// 1) cost-policy 순수 판정 SoT + 임계(80%/100%) + 가격 하드코딩 0
const policy = read('src/lib/cost-policy.ts') ?? ''
must(policy.length > 0, 'src/lib/cost-policy.ts 존재(판정 SoT)')
for (const fn of ['evaluateBudget', 'costToGuard', 'usdOf']) {
  must(new RegExp('export function ' + fn + '\\b').test(policy), `cost-policy export: ${fn}`)
}
must(/warnPct\s*=\s*0\.8/.test(policy), 'cost-policy: warn 임계 기본 0.8 (80%)')
must(/pct\s*>=\s*1\b/.test(policy), 'cost-policy: 100% block 임계')
// pricing 은 config 주입 — 가격 코드 상수 금지(grep)
must(!/const\s+(PRICING|RATE|USD_PER|PRICE)\b/.test(policy), 'cost-policy: 가격 하드코딩 상수 0건')

// 2) cost-ledger append-only(원자적) — evidence-ledger 패턴 재사용
const ledger = read('src/lib/cost-ledger.ts') ?? ''
must(ledger.length > 0, 'src/lib/cost-ledger.ts 존재')
must(/COST_PATH_REL/.test(ledger) && /cost\.jsonl/.test(ledger), 'cost-ledger: .vhk/cost.jsonl 경로')
for (const fn of ['readCostEntries', 'appendCostEntry', 'sumUsd']) {
  must(new RegExp('export function ' + fn + '\\b').test(ledger), `cost-ledger export: ${fn}`)
}
must(/atomicWriteFile/.test(ledger), 'cost-ledger: atomicWriteFile(원자적 append, 과거 줄 변경 0)')

// 3) config 주입(budget/pricing)
const cfg = read('src/lib/config.ts') ?? ''
must(/budget\?:/.test(cfg) && /pricing\?:/.test(cfg), 'config.ts: VhkConfig 에 budget/pricing 주입 필드')

// 4) cost 명령 + 등록 3지점(NLP 라우터 가로채기 방지)
must(existsSync('src/commands/cost.ts'), 'src/commands/cost.ts 존재')
const idx = read('src/index.ts') ?? ''
must(/import \{ cost \} from '\.\/commands\/cost\.js'/.test(idx), 'index.ts: cost import')
must(/\.command\('cost/.test(idx), "index.ts: .command('cost')")
const reg = read('src/lib/command-registry.ts') ?? ''
must(/name: 'cost'/.test(reg), "command-registry: TOP_LEVEL { name: 'cost' }")
must(/cost: \['add', 'check', 'budget'\]/.test(reg), 'command-registry: CONTAINER cost 서브명령')
const cargs = read('src/lib/cli-args.ts') ?? ''
must(/'cost'/.test(cargs), "cli-args: 'cost' 토큰(KNOWN_COMMAND_TOKENS)")
// 한글 별칭 비용 도 CONTAINER_ALIASES 에 있어야 `비용 check` 가 NL 라우터에 안 가로채임(적대 리뷰 #234).
must(/비용: 'cost'/.test(reg), 'command-registry: CONTAINER_ALIASES 비용→cost (한글 별칭 가드 우회 방지)')

// 5) 회귀 테스트 + 문서 반영(_meta)
for (const t of ['cost-policy', 'cost-ledger', 'cost']) {
  must(existsSync(`tests/${t}.test.ts`), `tests/${t}.test.ts 존재`)
}
must(/vhk cost/.test(read('COMMANDS.md') ?? ''), 'COMMANDS.md: vhk cost 반영')
must(/vhk cost/.test(read('README.md') ?? ''), 'README.md: vhk cost 반영')

if (pass) { console.log('✅ goal 56 gate passes'); process.exit(0) }
console.log('❌ goal 56 gate failed'); process.exit(1)
