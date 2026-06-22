#!/usr/bin/env node
// scripts/check-goal-80.mjs — goal 80: 증거 신선도 review 연결 (SHA≠HEAD/dirty → 낡음 강등).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 80 gate.')
  process.exit(1)
}

const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 80] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 80 고유 검증 ───────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
const r = read('src/commands/review.ts') ?? ''
must(/import \{ getCommitInfo, type CommitInfo \} from '\.\.\/lib\/git-repo\.js'/.test(r), 'review.ts getCommitInfo·CommitInfo import (git-repo 단일통로)')
must(/checkEvidenceFreshness/.test(r), 'review.ts 가 verify 의 checkEvidenceFreshness(SHA 비교) 재사용')
must(/basis: 'sha' \| 'time'/.test(r), 'EvidenceFreshness.basis(sha|time) 필드')
must(/reasons: string\[\]/.test(r), 'EvidenceFreshness.reasons 필드(낡음 사유)')
must(/function assessFreshness\([\s\S]*?current: CommitInfo \| null/.test(r), 'assessFreshness 가 current(HEAD) 주입 받음(순수성 유지)')
must(/const current = getCommitInfo\(cwd\)/.test(r), 'review() 가 현재 HEAD 를 읽어 비교에 전달')
must(/crossCheck\(checks, goalStatus, report, Date\.now\(\), current\)/.test(r), 'crossCheck 호출에 current 전달(배선)')
must(/current: CommitInfo \| null = null/.test(r), 'crossCheck 시그니처 current 옵셔널(구증거 graceful)')
// 출력 문구 정정: "생성시각으로만 추정" 제거 + SHA 명시
must(/SHA≠HEAD\/dirty.*낡음/.test(r) || /SHA로 판정/.test(r), 'disclaimer 가 SHA 기반 신선도 명시')
must(!/신선도는 생성시각으로만 추정/.test(r), 'disclaimer 에서 "생성시각으로만 추정"(구문구) 제거')

const t = read('tests/review.test.ts') ?? ''
must(/crossCheck SHA 신선도 \(Goal 80\)/.test(t), '회귀 테스트 describe(crossCheck SHA 신선도)')
must(/basis\)\.toBe\('sha'\)/.test(t), '테스트: SHA 일치/불일치 → basis sha')
must(/basis\)\.toBe\('time'\)/.test(t), '테스트: 구증거(commit 없음) → 생성시각 폴백')
must(/freshness\.stale\)\.toBe\(true\)/.test(t), '테스트: SHA≠HEAD/dirty → stale 강등')

const goal = read('goals/80-evidence-freshness-review.md') ?? ''
must(/status:\s*DONE/.test(goal), 'goals/80 status DONE')

// Forbidden(OUT) — verify/verify-report 시그니처 변경 0 (읽기 측만 추가)
must(/export function checkEvidenceFreshness\(\s*report: VerifyReport,\s*current: CommitInfo \| null\s*\)/.test(read('src/commands/verify.ts') ?? ''), 'verify.checkEvidenceFreshness 시그니처 불변(GA 안정성)')

if (pass) { console.log('✅ goal 80 gate passes'); process.exit(0) }
console.log('❌ goal 80 gate failed'); process.exit(1)
