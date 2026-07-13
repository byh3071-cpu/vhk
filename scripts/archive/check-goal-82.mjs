#!/usr/bin/env node
// scripts/check-goal-82.mjs — goal 82: .vhk 증거 원장 추적 정합 (ledger.jsonl·ai-actions.jsonl 레포 영속).
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

/** git 명령 표준출력(실패/비-git 환경 → ''). */
function gitOut(args) {
  try {
    return execFileSync('git', args, { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8' }).trim()
  } catch {
    return ''
  }
}

if (existsSync('.vhk/HARD_STOP')) {
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 82 gate.')
  process.exit(1)
}

const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 82] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 82 고유 검증 ───────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null

// 핵심: 증거 원장 2종이 git 추적된다(spec 1.1·Goal 45/55 — 레포 영속).
must(gitOut(['ls-files', '.vhk/ledger.jsonl']) !== '', '.vhk/ledger.jsonl git 추적(Goal 45 증거 영속 — untracked 노이즈 해소)')
must(gitOut(['ls-files', '.vhk/events/ai-actions.jsonl']) !== '', '.vhk/events/ai-actions.jsonl git 추적(Goal 55 행동 원장)')

// 어떤 .gitignore 로도 제외되지 않음(추적 가능 보장). --no-index: 이미 추적된 파일에도 ignore 패턴을
// 평가한다(--no-index 없으면 추적 파일엔 패턴이 안 잡혀 'gitignore 추가' 회귀를 놓침 — 데드 가드).
must(gitOut(['check-ignore', '--no-index', '--', '.vhk/ledger.jsonl']) === '', 'ledger.jsonl 이 .gitignore 로 제외되지 않음(증거 휘발 방지)')
must(gitOut(['check-ignore', '--no-index', '--', '.vhk/events/ai-actions.jsonl']) === '', 'ai-actions.jsonl 이 .gitignore 로 제외되지 않음')
// 양성 대조: 가드가 실제 작동함을 증명(실제 ignore 된 .vhk/memory.json 을 잡아야 함).
must(gitOut(['check-ignore', '--no-index', '--', '.vhk/memory.json']) !== '', '양성 대조 — 실제 ignore 경로(memory.json)를 가드가 검출(거짓 통과 방지)')

// 경계 명문화 + 회귀 가드 존재.
const readme = read('.vhk/README.md') ?? ''
must(/ledger\.jsonl/.test(readme) && /(레포 영속|✅)/.test(readme), '.vhk/README 트래킹 정책에 증거 원장 추적 명문화')
must(existsSync('tests/vhk-artifact-tracking.test.ts'), '회귀 테스트 tests/vhk-artifact-tracking.test.ts')

const goal = read('goals/82-vhk-artifact-gitignore.md') ?? ''
must(/status:\s*DONE/.test(goal), 'goals/82 status DONE')

if (pass) { console.log('✅ goal 82 gate passes'); process.exit(0) }
console.log('❌ goal 82 gate failed'); process.exit(1)
