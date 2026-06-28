#!/usr/bin/env node
// scripts/check-goal-86.mjs — 자동 생성 (vhk goal sync).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 86 gate.')
  process.exit(1)
}

// BOM-safe 읽기: PowerShell Set-Content -Encoding utf8 의 UTF-8 BOM 제거(없으면 throw).
const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 86] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 86 고유 검증 (vhk receipt MVP — RFC 0056 T1) ───────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null

// ① 순수 핵심(IO 0) — decision/render/build 분리
const core = read('src/lib/receipt.ts') ?? ''
must(/export function decideReceipt/.test(core), 'receipt.ts: decideReceipt 순수 판정(LLM 0)')
must(/export function buildReceipt/.test(core), 'receipt.ts: buildReceipt(.json 구조)')
must(/export function renderReceiptMarkdown/.test(core), 'receipt.ts: renderReceiptMarkdown(.md 붙여넣기)')
must(/export const HONESTY_LINE/.test(core), 'receipt.ts: 정직성 1줄 SoT')
must(/게으른 거짓완료/.test(core) && /미묘한 오류/.test(core), 'receipt.ts: 정직성 경계(게으른 거짓완료 vs 미묘한 오류)')
// 실차단(red·dirty·stale·forbidden) block — diff-cover 는 block 분기에 없어야 함(advisory 분리).
// 이 게이트는 기저 3종(red·dirty·stale) 분기 존재만 확인 — forbidden(Goal 87)은 check-goal-87 게이트 소관.
must(/e\.gates\.red \|\| e\.dirty \|\| \(e\.staleKnown && e\.stale\)/.test(core), 'receipt.ts: 기저 실차단(red·dirty·stale) block 분기 존재 — forbidden 은 check-goal-87')

// ② 경계(IO) — 기존 자산 재사용 글루코드(신규 발명 최소)
const cmd = read('src/commands/receipt.ts') ?? ''
must(/verifyEvidence/.test(cmd), 'commands/receipt.ts: verifyEvidence 재사용(① 실종료코드)')
must(/getCommitInfo/.test(cmd), 'commands/receipt.ts: getCommitInfo 재사용(② dirty — Goal 85 자기파일 제외)')
must(/diffCoverage/.test(cmd), 'commands/receipt.ts: diffCoverage 재사용(④ advisory)')
must(/ensureVhkIgnored/.test(cmd), 'commands/receipt.ts: .vhk/receipts/ gitignore(자기 dirty 오염 방지)')
must(/printNextStep/.test(cmd), 'commands/receipt.ts: printNextStep 패턴(사용자대면)')

// ③ 등록 4지점 + nlp + 한글별칭
must(/\.command\('receipt'\)/.test(read('src/index.ts') ?? ''), 'index.ts: receipt 명령 등록')
must(/증거영수증/.test(read('src/index.ts') ?? ''), 'index.ts: 한글별칭 증거영수증')
must(/name: 'receipt'/.test(read('src/lib/command-registry.ts') ?? ''), 'command-registry.ts: TOP_LEVEL receipt')
must(/'receipt', '증거영수증'/.test(read('src/lib/cli-args.ts') ?? ''), 'cli-args.ts: KNOWN_COMMAND_TOKENS receipt/증거영수증')
must(/command: 'receipt'/.test(read('src/lib/nlp-router.ts') ?? ''), 'nlp-router.ts: receipt 라우팅 규칙')
must(/receipt:/.test(read('src/i18n/ko.ts') ?? ''), 'ko.ts: receipt 메시지 네임스페이스')

// ④ 불변식 테스트 존재(단조성·advisory 분리) + 등록 드리프트 테스트
const t = read('tests/receipt.test.ts') ?? ''
must(/caution\s*→\s*pass|단조성/.test(t), 'tests/receipt.test.ts: 단조성 불변식(caution→pass 금지) 테스트')
must(/advisory/.test(t), 'tests/receipt.test.ts: diff-cover advisory 분리(block 미격하) 테스트')
must(existsSync('tests/receipt-registration.test.ts'), 'tests/receipt-registration.test.ts 존재(등록 4지점 드리프트)')

if (pass) { console.log('✅ goal 86 gate passes'); process.exit(0) }
console.log('❌ goal 86 gate failed'); process.exit(1)
