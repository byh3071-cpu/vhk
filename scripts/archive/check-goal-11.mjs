#!/usr/bin/env node
// scripts/check-goal-11.mjs — 자동 생성 (vhk goal sync).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 11 gate.')
  process.exit(1)
}

const pkg = existsSync('package.json') ? JSON.parse(readFileSync('package.json', 'utf-8')) : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 11] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 11 고유 검증 (대화형/비대화형 통합 가드) ──────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
const it = read('src/lib/interactive.ts') ?? ''
must(/export function isInteractive/.test(it) && /export async function promptOrDefault/.test(it), 'isInteractive/promptOrDefault SoT')
must(/process\.stdin\.isTTY/.test(it) && /VHK_FORCE_INTERACTIVE/.test(it), 'stdin 축 + Git Bash 탈출구(E3)')
must(/'restore'/.test(read('src/lib/risk-policy.ts') ?? ''), 'restore HIGH_RISK (R3)')
must(/lite-noninteractive-block/.test(read('src/lib/safety-guard.ts') ?? ''), 'lite여도 비대화형 destructive 중단 (R13)')
must(/guardCli\('restore'/.test(read('src/index.ts') ?? ''), 'restore guardCli 래핑')
const initSrc = read('src/commands/init.ts') ?? ''
must(/isInteractive\(options\)/.test(initSrc) && !/function isNonInteractive/.test(initSrc), 'init 이 isInteractive SoT 사용(로컬 헬퍼 제거)')
must(/ensureInteractive\(/.test(read('src/commands/gate.ts') ?? ''), 'gate essential 진입거부 (R2)')
must(/promptOrDefault/.test(read('src/commands/save.ts') ?? ''), 'save 비대화형 기본값/안전중단 (S1)')

if (pass) { console.log('✅ goal 11 gate passes'); process.exit(0) }
console.log('❌ goal 11 gate failed'); process.exit(1)
