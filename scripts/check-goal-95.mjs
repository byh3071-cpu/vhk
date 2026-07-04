#!/usr/bin/env node
// scripts/check-goal-95.mjs — 자동 생성 (vhk goal sync).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 95 gate.')
  process.exit(1)
}

// BOM-safe 읽기: PowerShell Set-Content -Encoding utf8 의 UTF-8 BOM 제거(없으면 throw).
const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 95] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 95 고유 검증 (직접 추가) ───────────────────────────────
// goal 95 = 순수 문서 트랙(트랙③, RFC 0057). 코드(src/**) 변경은 이 goal 범위 밖 —
// 아래는 산출물(문서) 존재·핵심 근거 인용 여부만 확인한다(내용 존재 검증, 코드 실행 검증 아님).
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null

const rfc = read('docs/rfc/0057-agent-agnostic-compounding.md')
must(rfc !== null, 'docs/rfc/0057-agent-agnostic-compounding.md 존재')
must(rfc?.includes('Agent-Agnostic Compounding'), 'RFC 0057 제목에 Agent-Agnostic Compounding 포함')
must(rfc?.includes('에이전트 불가지론'), 'RFC 0057 이 "에이전트 불가지론" 정체성 축 명시')
must(rfc?.includes('자가진화 복리'), 'RFC 0057 이 "자가진화 복리" 정체성 축 명시')
must(
  rfc?.includes('ecosystem-mdc.ts:17-18') || rfc?.includes('ecosystem-mdc.ts`:17-18'),
  'RFC 0057 이 ecosystem-mdc.ts:17-18 (실측 감사 #3) file:line 근거 인용'
)
must(rfc?.includes('src/lib/receipt.ts:75-88'), 'RFC 0057 이 receipt.ts ReceiptEvidence(실측 감사 #4) file:line 근거 인용')
must(rfc?.includes('src/lib/receipt-log.ts:22-47'), 'RFC 0057 이 receipt-log.ts ReceiptLogEntry(실측 감사 #4) file:line 근거 인용')
must(
  rfc?.includes('src/commands/init.ts:529-541') || rfc?.includes('ensureSessionStartHook'),
  'RFC 0057 이 트리거 계층(init.ts ensureSessionStartHook, 실측 감사 #2) file:line 근거 인용'
)
must(rfc?.includes('Run 객체'), 'RFC 0057 이 RFC 0055 "Run 객체" 계승 손실 경위(§3) 서술')
must(rfc?.includes('RFC 0055') && rfc?.includes('RFC 0056'), 'RFC 0057 이 RFC 0055·0056 양쪽을 인용')
must(
  rfc?.includes('메모리 프라이버시') && rfc?.includes('할루시네이션 감소 루프'),
  'RFC 0057 이 후속 유보 2건(메모리 프라이버시 긴장·할루시네이션 감소 루프)을 명시'
)
must(
  rfc?.includes('트랙①') && rfc?.includes('트랙②') && rfc?.includes('트랙③'),
  'RFC 0057 이 스코프 결정(트랙①②③)을 명시'
)

const devlog = read('docs/log/2026-07-04-rfc0057-track3-docs.md')
must(devlog !== null, 'docs/log/2026-07-04-rfc0057-track3-docs.md 존재(dev log)')
must(devlog?.includes('append-only'), 'dev log 가 append-only 고지 포함(governance 규칙 준수)')
must(devlog?.includes('코드 변경 0건') || devlog?.includes('코드(`src/**`) 변경'), 'dev log 가 코드 변경 0건임을 명시')

const nextTask = read('docs/state/next-task.md')
must(
  nextTask?.includes('docs/rfc/0057-agent-agnostic-compounding.md') && nextTask?.includes('3트랙 병렬 착수'),
  'next-task.md 최상단이 RFC 0057 3트랙 착수 사실로 갱신됨(append, 기존 내용 보존)'
)

const goalFile = read('goals/95-rfc0057-trigger-gap-docs.md')
must(goalFile?.includes('status: DONE'), 'goals/95 frontmatter 가 status: DONE')
must(goalFile?.includes('priority: P2'), 'goals/95 frontmatter 가 priority: P2')

if (pass) { console.log('✅ goal 95 gate passes'); process.exit(0) }
console.log('❌ goal 95 gate failed'); process.exit(1)
