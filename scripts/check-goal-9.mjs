#!/usr/bin/env node
// scripts/check-goal-9.mjs — 자동 생성 (vhk goal sync).
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
    execFileSync(bin, argv, { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })
    return true
  } catch (e) {
    const out = (e?.stdout?.toString() ?? '') + (e?.stderr?.toString() ?? '')
    if (out.trim()) console.log(out.split('\n').slice(-25).join('\n'))
    return false
  }
}

if (existsSync('.vhk/HARD_STOP')) {
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 9 gate.')
  process.exit(1)
}

const pkg = existsSync('package.json') ? JSON.parse(readFileSync('package.json', 'utf-8')) : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 9] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 9 고유 검증 (Windows 1급) ─────────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
const goalSrc = read('src/commands/goal.ts') ?? ''
// findGateScript 가 .mjs 를 .sh 보다 먼저 본다.
must(goalSrc.indexOf('check-goal-${id}.mjs') < goalSrc.indexOf('check-goal-${id}.sh'), 'findGateScript .mjs 우선')
// .mjs 게이트는 node 로 실행 (bash 불필요).
must(/isMjs\s*\?\s*'node'/.test(goalSrc), 'runGate .mjs → node 러너')
must(/warnIfBashOnWindows/.test(goalSrc), 'Windows .sh 친절 안내(warnIfBashOnWindows)')
must(!/\bexecSync\b/.test(goalSrc), 'goal.ts execSync 미사용')
// exec 유틸: shell:false + Windows .cmd 래핑 (CVE-2024-27980), execSync 금지.
const execSrc = read('src/lib/exec.ts') ?? ''
must(/cmd\.exe/.test(execSrc) && /execFileSync/.test(execSrc), 'safeExecFile cmd.exe 래핑 + execFileSync')
must(!/\bexecSync\b/.test(execSrc), 'exec.ts execSync 미사용')
// 게이트 헬퍼(.mjs)도 Windows .cmd 래핑.
must(/cmd\.exe/.test(read('scripts/_lib.mjs') ?? ''), 'scripts/_lib.mjs cmd.exe 래핑')

if (pass) { console.log('✅ goal 9 gate passes'); process.exit(0) }
console.log('❌ goal 9 gate failed'); process.exit(1)
