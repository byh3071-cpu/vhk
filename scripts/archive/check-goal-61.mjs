#!/usr/bin/env node
// scripts/check-goal-61.mjs — 통계·대시보드 집계(vhk stats) 게이트.
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 61 gate.')
  process.exit(1)
}

const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 61] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 61 고유 검증 (vhk stats 읽기전용 집계) ───────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null

// 1) 신규 파일 + 핵심 export.
const statsSrc = read('src/commands/stats.ts') ?? ''
const aiLedger = read('src/lib/ai-actions-ledger.ts') ?? ''
must(statsSrc.length > 0, 'src/commands/stats.ts 존재')
must(aiLedger.length > 0, 'src/lib/ai-actions-ledger.ts 존재')
must(/export async function stats/.test(statsSrc), 'stats() 커맨드 export')
must(/export function countLedgerStatus/.test(statsSrc) && /export function calcBlockRate/.test(statsSrc) && /export function calcApplyRate/.test(statsSrc), '집계 순수함수 3종 export')
must(/export function readAiActions/.test(aiLedger), 'readAiActions export')
must(/return \[\]/.test(aiLedger), 'ai-actions 파일없음 → [] 안전(55 미연동)')

// 2) 3소스 집계(ledger + ai-actions + evolve queue).
must(/readLedger/.test(statsSrc) && /readAiActions/.test(statsSrc) && /readQueue/.test(statsSrc), 'ledger+ai-actions+evolve 3소스 집계')

// 3) 읽기 전용 — stats.ts 에 파일 쓰기 API 0건.
const WRITE_APIS = /writeFileSync|appendFileSync|atomicWriteFile|writeQueue|appendLedgerEntry|writeMemory|mkdirSync|rmSync|renameSync|copyFileSync/
must(!WRITE_APIS.test(statsSrc), 'stats.ts 파일 쓰기 API 0건(읽기 전용)')
must(!WRITE_APIS.test(aiLedger), 'ai-actions-ledger.ts 파일 쓰기 API 0건(reader 전용)')

// 4) 신규 명령 4지점 등록(index .command + TOP_LEVEL + cli-args token + 한글별칭).
const index = read('src/index.ts') ?? ''
const registry = read('src/lib/command-registry.ts') ?? ''
const cliArgs = read('src/lib/cli-args.ts') ?? ''
must(/\.command\('stats'\)/.test(index), "index.ts .command('stats') 등록")
must(/통계/.test(index) && /\.alias\('통계'\)/.test(index), "index.ts 한글별칭 '통계'")
must(/name:\s*'stats'/.test(registry), 'command-registry TOP_LEVEL stats')
must(/'stats'/.test(cliArgs) && /'통계'/.test(cliArgs), 'cli-args KNOWN_COMMAND_TOKENS stats/통계')

// 5) i18n + 테스트.
must(/stats:\s*\{/.test(read('src/i18n/ko.ts') ?? ''), 'i18n ko.stats 블록')
must(existsSync('tests/stats.test.ts') && existsSync('tests/ai-actions-ledger.test.ts'), 'stats/ai-actions 테스트 존재')
if (!skipDeep) {
  must(run(pm, ['exec', 'vitest', 'run', 'tests/stats.test.ts', 'tests/ai-actions-ledger.test.ts']), 'stats/ai-actions 테스트 통과')
}

if (pass) { console.log('✅ goal 61 gate passes'); process.exit(0) }
console.log('❌ goal 61 gate failed'); process.exit(1)
