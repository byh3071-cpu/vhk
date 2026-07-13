#!/usr/bin/env node
// scripts/check-goal-45.mjs — 자동 생성(vhk goal sync) 후 goal 고유 검증 손추가.
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 45 gate.')
  process.exit(1)
}

const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 45] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 45 고유 검증 (증거 원장 ledger.jsonl) ─────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
const led = read('src/lib/evidence-ledger.ts') ?? ''
must(led !== '', 'src/lib/evidence-ledger.ts 존재')
must(/export function buildLedgerEntry/.test(led), 'buildLedgerEntry export')
must(/export function appendLedgerEntry/.test(led), 'appendLedgerEntry export')
must(/export function readLedger/.test(led), 'readLedger export')
must(/LEDGER_PATH_REL/.test(led) && /'\.vhk'/.test(led) && /'ledger\.jsonl'/.test(led), "원장 경로 = .vhk/ledger.jsonl")
must(!/reports/.test(led.match(/LEDGER_PATH_REL[^\n]*/)?.[0] ?? ''), '원장이 reports/ 아래 아님(추적 가능)')
must(/version/.test(led) && /date/.test(led) && /status/.test(led) && /sha/.test(led), '항목에 version·date·status·sha')
must(/atomicWriteFile/.test(led), '원자적 쓰기(atomicWriteFile) 사용')
must(!/execSync/.test(led), 'evidence-ledger.ts execSync 없음')
must(!/JSON\.parse\(\s*(?:fs\.)?readFileSync/.test(led), 'evidence-ledger.ts raw JSON.parse(readFileSync) 없음(stripBom 경유)')
// verify 가 원장에 기록
const verify = read('src/commands/verify.ts') ?? ''
must(/appendLedgerEntry/.test(verify) && /buildLedgerEntry/.test(verify), 'verifyEvidence 가 원장에 append')
// 원장이 .vhk/.gitignore 에 안 잡혀야 함(git 추적)
const vhkIgnore = read('.vhk/.gitignore') ?? ''
must(!/ledger/.test(vhkIgnore), '.vhk/.gitignore 가 ledger 를 무시하지 않음(추적 유지)')
// 회귀 테스트
must(existsSync('tests/evidence-ledger.test.ts'), 'tests/evidence-ledger.test.ts 존재')

if (pass) { console.log('✅ goal 45 gate passes'); process.exit(0) }
console.log('❌ goal 45 gate failed'); process.exit(1)
