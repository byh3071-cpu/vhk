#!/usr/bin/env node
// scripts/check-goal-94.mjs — 자동 생성 (vhk goal sync).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 94 gate.')
  process.exit(1)
}

// BOM-safe 읽기: PowerShell Set-Content -Encoding utf8 의 UTF-8 BOM 제거(없으면 throw).
const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 94] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 94 고유 검증 (직접 추가) ───────────────────────────────
// RFC 0057 트랙②: receipt/receipt-log/evidence-ledger/ai-actions-ledger 4대 스키마에
// agent(에이전트 attribution) 필드 추가. 원칙1("decision=기계증거 전용, LLM 0")이 타입
// 레벨로 강제되는지, 순수함수(evidence-ledger)가 순수한지를 문자열 검증으로 확인한다.
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null

// 1) detect-agent.ts — 토대. AgentId allowlist + CODEX_COMPANION_SESSION_ID 함정 제외.
const detectAgentTs = read('src/lib/detect-agent.ts')
must(detectAgentTs?.includes("export type AgentId = 'claude-code' | 'unknown'"), 'detect-agent.ts 가 AgentId allowlist(claude-code|unknown) export')
must(detectAgentTs?.includes('export function detectAgent'), 'detect-agent.ts 가 detectAgent() export')
must(detectAgentTs?.includes("envVar: 'CLAUDECODE'"), "detectAgent 가 CLAUDECODE 신호 포함")
must(detectAgentTs?.includes("envVar: 'CLAUDE_CODE_ENTRYPOINT'"), "detectAgent 가 CLAUDE_CODE_ENTRYPOINT 신호 포함")
must(detectAgentTs?.includes("envVar: 'CLAUDE_PROJECT_DIR'"), "detectAgent 가 CLAUDE_PROJECT_DIR 신호 포함")
// 함정 회귀 가드: CODEX_COMPANION_SESSION_ID 를 *신호로*(envVar 값) 넣으면 안 된다. 배경 설명
// 주석에서 그 이름을 언급하는 것 자체는 허용(오히려 권장) — envVar 매핑 여부만 본다.
must(!/envVar:\s*'CODEX_COMPANION_SESSION_ID'/.test(detectAgentTs ?? ''), 'detectAgent 가 CODEX_COMPANION_SESSION_ID 를 신호로 안 씀(허위 Codex 신호 함정 — RFC 0057 실측)')

const detectAgentTest = read('tests/detect-agent.test.ts')
must(
  detectAgentTest?.includes('CODEX_COMPANION_SESSION_ID') && /CODEX_COMPANION_SESSION_ID[\s\S]*?unknown/.test(detectAgentTest ?? ''),
  'detect-agent.test.ts 에 CODEX_COMPANION_SESSION_ID → unknown 회귀 가드 테스트 존재'
)

// 2) receipt.ts — Receipt/ReceiptMeta 에 agent, ReceiptEvidence 는 절대 안 됨(원칙1 핵심).
const receiptTs = read('src/lib/receipt.ts')
must(receiptTs?.includes("import type { AgentId } from './detect-agent.js'"), 'receipt.ts 가 AgentId 타입 import')
must(/interface ReceiptMeta \{[\s\S]*?agent\?: AgentId[\s\S]*?\}/.test(receiptTs ?? ''), 'ReceiptMeta 에 agent?: AgentId 존재')
must(/interface Receipt \{[\s\S]*?agent\?: AgentId/.test(receiptTs ?? ''), 'Receipt 에 agent?: AgentId 존재')
must(receiptTs?.includes("agent: meta.agent ?? 'unknown'"), "buildReceipt 가 agent: meta.agent ?? 'unknown' 반영")
// 원칙1 핵심 가드: ReceiptEvidence 인터페이스 블록 안에 agent 가 있으면 FAIL — decideReceipt(e:
// ReceiptEvidence) 가 타입 레벨로 이 필드에 접근 불가능해야 한다.
{
  const t = receiptTs ?? ''
  const start = t.indexOf('export interface ReceiptEvidence')
  const end = start >= 0 ? t.indexOf('\n}', start) : -1
  const body = start >= 0 && end > start ? t.slice(start, end) : ''
  must(start >= 0 && !/agent/i.test(body), 'ReceiptEvidence 에 agent 필드 없음(원칙1 — decision=기계증거 전용, LLM 0, 타입 레벨 강제)')
}

const collectReceiptTs = read('src/commands/receipt.ts')
must(collectReceiptTs?.includes("import { detectAgent } from '../lib/detect-agent.js'"), 'commands/receipt.ts 가 detectAgent import')
must(collectReceiptTs?.includes('agent: detectAgent()'), 'collectReceipt() 이 buildReceipt meta 에 agent: detectAgent() 배선')

const receiptTest = read('tests/receipt.test.ts')
must(
  receiptTest?.includes('agent 는 decision·reasons 에 절대 무영향'),
  'receipt.test.ts 에 decideReceipt 순수성(agent 무영향) 회귀 테스트 존재(원칙1 행동 증명)'
)

// 3) receipt-log.ts — Receipt.agent 를 그대로 매핑(별도 감지 불필요).
const receiptLogTs = read('src/lib/receipt-log.ts')
must(receiptLogTs?.includes("import type { AgentId } from './detect-agent.js'"), 'receipt-log.ts 가 AgentId 타입 import')
must(/interface ReceiptLogEntry \{[\s\S]*?agent\?: AgentId/.test(receiptLogTs ?? ''), 'ReceiptLogEntry 에 agent?: AgentId 존재')
must(receiptLogTs?.includes("agent: r.agent ?? 'unknown'"), "buildReceiptLogEntry 가 agent: r.agent ?? 'unknown' 매핑(Receipt.agent 복사)")

// 4) evidence-ledger.ts — 순수함수 유지(정적 기본값, detectAgent() 호출 금지).
const evidenceLedgerTs = read('src/lib/evidence-ledger.ts')
must(/interface LedgerEntry \{[\s\S]*?agent\?: AgentId/.test(evidenceLedgerTs ?? ''), 'LedgerEntry 에 agent?: AgentId 존재')
must(
  /function buildLedgerEntry\([^)]*agent: AgentId = 'unknown'[^)]*\)/.test(evidenceLedgerTs ?? ''),
  "buildLedgerEntry 3번째 인자가 정적 기본값 agent: AgentId = 'unknown' (detectAgent() 호출 아님 — 순수함수 유지)"
)
// why-주석에서 "detectAgent() 호출이 아니라 정적 리터럴" 처럼 이름을 설명용으로 언급하는 것은
// 허용 — 실제 VALUE import(런타임 호출 경로)만 금지한다(타입 전용 import 는 무해).
must(!/import\s*\{\s*detectAgent/.test(evidenceLedgerTs ?? ''), 'evidence-ledger.ts 가 detectAgent 를 값으로 import 안 함(순수함수 유지 — 실감지는 호출부 담당, 설명 주석은 허용)')

const verifyTs = read('src/commands/verify.ts')
must(verifyTs?.includes("import { detectAgent } from '../lib/detect-agent.js'"), 'commands/verify.ts 가 detectAgent import')
must(
  /buildLedgerEntry\(report, readPackageVersion\(cwd\), detectAgent\(\)\)/.test(verifyTs ?? ''),
  'verifyEvidence() 이 buildLedgerEntry 3번째 인자로 detectAgent() 배선'
)

// 5) action-ledger.ts(writer) + ai-actions-ledger.ts(reader) — 독립 선언 양쪽 다 필드 어긋남 없이.
const actionLedgerTs = read('src/lib/action-ledger.ts')
must(/interface AiActionEntry \{[\s\S]*?agent\?: AgentId/.test(actionLedgerTs ?? ''), 'action-ledger.ts AiActionEntry(writer) 에 agent?: AgentId 존재')

const aiActionsLedgerTs = read('src/lib/ai-actions-ledger.ts')
must(/interface AiActionEntry \{[\s\S]*?agent\?: AgentId/.test(aiActionsLedgerTs ?? ''), 'ai-actions-ledger.ts AiActionEntry(reader, 독립 선언) 에 agent?: AgentId 존재')

const aiActionsLedgerTest = read('tests/ai-actions-ledger.test.ts')
must(
  aiActionsLedgerTest?.includes('agent') && /구버전|하위호환/.test(aiActionsLedgerTest ?? ''),
  'ai-actions-ledger.test.ts 에 agent 필드 있는/없는 줄 혼재 하위호환 회귀 테스트 존재'
)

// 6) safety-guard.ts — 단일 chokepoint. override 우선, 없으면 자동 감지.
const safetyGuardTs = read('src/lib/safety-guard.ts')
must(
  safetyGuardTs?.includes("import { detectAgent, type AgentId } from './detect-agent.js'"),
  'safety-guard.ts 가 detectAgent + AgentId import'
)
must(/interface GuardDeps \{[\s\S]*?agent\?: AgentId/.test(safetyGuardTs ?? ''), 'GuardDeps 에 agent?: AgentId(override) 존재')
must(safetyGuardTs?.includes('agent: deps.agent ?? detectAgent()'), 'runGuarded 의 appendActionEntry 호출이 agent: deps.agent ?? detectAgent() 배선')

const actionLedgerTest = read('tests/action-ledger.test.ts')
must(
  actionLedgerTest?.includes('env 감지보다 우선') || actionLedgerTest?.includes('override'),
  'action-ledger.test.ts 에 GuardDeps.agent override 가 env 감지보다 우선함을 확인하는 테스트 존재'
)

if (pass) { console.log('✅ goal 94 gate passes'); process.exit(0) }
console.log('❌ goal 94 gate failed'); process.exit(1)
