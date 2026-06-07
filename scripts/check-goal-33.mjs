#!/usr/bin/env node
// scripts/check-goal-33.mjs — 자동 생성 (vhk goal sync).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 33 gate.')
  process.exit(1)
}

// BOM-safe 읽기: PowerShell Set-Content -Encoding utf8 의 UTF-8 BOM 제거(없으면 throw).
const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 33] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 33 고유 검증 (vhk today — Phase 1) ───────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
must(existsSync('src/daily/today.ts'), 'src/daily/today.ts 존재')
must(existsSync('src/commands/today.ts'), 'src/commands/today.ts (CLI) 존재')
must(existsSync('tests/daily/today.test.ts'), 'tests/daily/today.test.ts 존재')
const today = read('src/daily/today.ts') ?? ''
// 재사용(이중 구현 0): Goal 32 daily 모듈 — gitlog·goals·listGoals·localDate
must(/commitsInRange|fetchRecentCommitSummaries/.test(today), 'today 가 daily/gitlog 재사용')
must(/doneGoalsOnDay/.test(today), 'today 가 daily/goals 재사용')
must(/listGoals/.test(today), 'today 가 listGoals 재사용')
must(/localDate/.test(today), 'today 가 localDate(KST) 재사용')
// v0 설계: 단순 카운트 — streak/게임요소·AI요약 없음
must(!/streak/i.test(today), 'today v0 에 streak 없음(담백 카운트)')
must(/buildTodayReport/.test(today) && /pickMessage/.test(today), 'buildTodayReport(순수) + pickMessage(격려) 존재')
// 불변규칙: execSync 0 · raw JSON.parse 0
must(!/execSync/.test(today), 'today execSync 없음')
must(!/JSON\.parse/.test(today), 'today raw JSON.parse 없음')
// 읽기전용 — HARD_STOP 가드 없음(standup/doctor 일관)
must(!/ensureNotHardStopped/.test(read('src/commands/today.ts') ?? ''), 'today 는 HARD_STOP 가드 없음(읽기전용)')
// 공유 헬퍼: 요일 포맷 date.ts 로 추출(standup 인라인 중복 실제 축소)
must(/formatYmdWeekday/.test(read('src/lib/date.ts') ?? ''), 'date.ts 에 formatYmdWeekday 공유 헬퍼')
must(/formatYmdWeekday/.test(read('src/commands/standup.ts') ?? ''), 'standup 이 formatYmdWeekday 재사용(인라인 중복 제거)')
must(!/function withWeekday/.test(read('src/commands/standup.ts') ?? ''), 'standup 인라인 withWeekday 제거됨')
// CLI 단일소스 등록
must(/today/.test(read('src/index.ts') ?? ''), 'index.ts 에 today 등록')
must(/'today'/.test(read('src/lib/command-registry.ts') ?? ''), 'command-registry 등록')
must(/'today'/.test(read('src/lib/cli-args.ts') ?? ''), 'cli-args 등록')

if (pass) { console.log('✅ goal 33 gate passes'); process.exit(0) }
console.log('❌ goal 33 gate failed'); process.exit(1)
