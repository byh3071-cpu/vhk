#!/usr/bin/env node
// scripts/check-goal-97.mjs — 자동 생성 (vhk goal sync).
// 기본 게이트 = typecheck + (lint) + test + build. goal 고유 검증은 아래 구역에 추가.
// sync 재실행해도 기존 파일은 덮어쓰지 않습니다 (idempotent).
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
    // maxBuffer 상향: 큰 빌드/테스트 로그(>1MB)에서 성공해도 ENOBUFS 거짓실패 방지.
    execFileSync(bin, argv, { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })
    return true
  } catch (e) {
    const out = (e?.stdout?.toString() ?? '') + (e?.stderr?.toString() ?? '')
    if (out.trim()) console.log(out.split('\n').slice(-25).join('\n'))
    return false
  }
}

if (existsSync('.vhk/HARD_STOP')) {
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 97 gate.')
  process.exit(1)
}

// BOM-safe 읽기: PowerShell Set-Content -Encoding utf8 의 UTF-8 BOM 제거(없으면 throw).
const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 97] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
const must = (cond, label) => { console.log((cond ? '    ✓ ' : '    ✗ ') + label); if (!cond) pass = false }

// typecheck (스크립트 우선, 없으면 tsc --noEmit)
if (scripts.typecheck) gate('typecheck', run(pm, ['run', 'typecheck']))
else if (existsSync('tsconfig.json')) gate('tsc --noEmit', run(pm, pm === 'npm' ? ['exec', '--', 'tsc', '--noEmit'] : ['exec', 'tsc', '--noEmit']))
if (scripts.lint) gate('lint', run(pm, ['run', 'lint']))
if (!skipDeep) {
  if (scripts['test:run']) gate('test', run(pm, ['run', 'test:run']))
  else if (scripts.test && /vitest/.test(scripts.test)) gate('test', run(pm, ['run', 'test', '--', '--run']))
  else if (scripts.test) gate('test', run(pm, ['run', 'test']))
  if (scripts.build) gate('build', run(pm, ['run', 'build']))
}

// ─── goal 97 고유 검증 (직접 추가) ───────────────────────────────
// #374: evolve 효과측정 — apply/reject 결정 로그(evolve-log.jsonl) + check 위반수 스냅샷
// (check-log.jsonl) + stats 분석 확장(calcAdoptionStats/computeCheckTrend).
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null

// 1) evolve-log.ts — 토대.
const evolveLogTs = read('src/lib/evolve-log.ts')
must(evolveLogTs?.includes("export const EVOLVE_LOG_REL"), 'evolve-log.ts 가 EVOLVE_LOG_REL export')
must(evolveLogTs?.includes('export interface EvolveLogEntry'), 'evolve-log.ts 가 EvolveLogEntry 타입 export')
must(evolveLogTs?.includes('export function buildEvolveLogEntry'), 'evolve-log.ts 가 buildEvolveLogEntry() export')
must(evolveLogTs?.includes('export function readEvolveLog'), 'evolve-log.ts 가 readEvolveLog() export')
must(evolveLogTs?.includes('export function appendEvolveLog'), 'evolve-log.ts 가 appendEvolveLog() export')
must(evolveLogTs?.includes("'.vhk', 'events'"), 'evolve-log.ts 가 .vhk/events/ 경로 사용(self-tracked dirty 면제 상속)')

// 2) check-log.ts — 토대.
const checkLogTs = read('src/lib/check-log.ts')
must(checkLogTs?.includes('export const CHECK_LOG_REL'), 'check-log.ts 가 CHECK_LOG_REL export')
must(checkLogTs?.includes('export interface CheckLogEntry'), 'check-log.ts 가 CheckLogEntry 타입 export')
must(checkLogTs?.includes('export function buildCheckLogEntry'), 'check-log.ts 가 buildCheckLogEntry() export')
must(checkLogTs?.includes('export function readCheckLog'), 'check-log.ts 가 readCheckLog() export')
must(checkLogTs?.includes('export function appendCheckLog'), 'check-log.ts 가 appendCheckLog() export')

// 3) evolve.ts — apply/reject 배선 + reject reason 인자.
const evolveTs = read('src/commands/evolve.ts')
must(evolveTs?.includes("from '../lib/evolve-log.js'"), 'evolve.ts 가 evolve-log.js 에서 import')
must(
  /export async function evolveApply[\s\S]*?appendEvolveLog\(cwd, buildEvolveLogEntry\(item, true, now\)\)/.test(evolveTs ?? ''),
  'evolveApply() 가 applied 확정 후 appendEvolveLog(...,true,...) 호출'
)
must(
  /export async function evolveReject\(idStr: string, reason\?: string\)/.test(evolveTs ?? ''),
  'evolveReject 시그니처에 optional reason 인자 존재(하위호환 — 생략 가능)'
)
must(
  /appendEvolveLog\(cwd, buildEvolveLogEntry\(item, false,/.test(evolveTs ?? ''),
  'evolveReject() 가 rejected 확정 후 appendEvolveLog(...,false,...) 호출'
)

// 4) index.ts — evolve reject 커맨드에 [reason] 위치인자 등록.
const indexTs = read('src/index.ts')
must(
  indexTs?.includes("'reject <id> [reason]'"),
  "index.ts 의 evolve reject 커맨드가 '[reason]' 옵셔널 위치인자 등록"
)
must(
  /evolveReject\(id, reason\)/.test(indexTs ?? ''),
  'index.ts 의 evolve reject action 이 reason 을 evolveReject 에 전달'
)
must(indexTs?.includes("'--json', 'JSON 요약 출력"), "index.ts 의 check 커맨드가 --json 옵션 등록(#374)")

// 5) check.ts — computeCheckSummary 추출 + --json + check-log 배선.
const checkTs = read('src/commands/check.ts')
must(checkTs?.includes('export function computeCheckSummary'), 'check.ts 가 computeCheckSummary() export(콘솔출력과 분리)')
must(/interface CheckOptions \{[\s\S]*?json\?: boolean/.test(checkTs ?? ''), 'CheckOptions 에 json?: boolean 존재')
must(checkTs?.includes("from '../lib/check-log.js'"), 'check.ts 가 check-log.js 에서 import')
must(checkTs?.includes('appendCheckLog(cwd, buildCheckLogEntry('), 'checkRules() 가 appendCheckLog(...) 호출')
must(checkTs?.includes('console.log(JSON.stringify(summary, null, 2))'), '--json 시 summary 를 순수 JSON 으로 출력')

// 6) stats.ts — calcAdoptionStats/computeCheckTrend 추가, 기존 calcApplyRate 하위호환 유지.
const statsTs = read('src/commands/stats.ts')
must(statsTs?.includes('export function calcAdoptionStats'), 'stats.ts 가 calcAdoptionStats() export(결정 기준 채택률)')
must(statsTs?.includes('export function computeCheckTrend'), 'stats.ts 가 computeCheckTrend() export(위반수 추세)')
must(statsTs?.includes('export function calcApplyRate'), '기존 calcApplyRate() 하위호환 유지(대체 아님)')
must(statsTs?.includes('renderEvolveEffect'), 'stats.ts 의 --trend 렌더가 renderEvolveEffect() 배선')

// 7) 테스트 파일 존재 확인(TDD 산출물).
for (const f of [
  'tests/evolve-log.test.ts',
  'tests/check-log.test.ts',
  'tests/stats-evolve-effect.test.ts',
  'tests/check-json-and-log.test.ts',
  'tests/evolve-reject-reason.test.ts',
  'tests/evolve-apply-log.test.ts',
]) {
  must(existsSync(f), `${f} 존재`)
}

if (pass) { console.log('✅ goal 97 gate passes'); process.exit(0) }
console.log('❌ goal 97 gate failed'); process.exit(1)
