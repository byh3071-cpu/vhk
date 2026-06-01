#!/usr/bin/env node
// scripts/check-goal-8.mjs — 자동 생성 (vhk goal sync).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 8 gate.')
  process.exit(1)
}

const pkg = existsSync('package.json') ? JSON.parse(readFileSync('package.json', 'utf-8')) : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 8] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 8 고유 검증 (init -y 완전 비대화형) ───────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
const initSrc = read('src/commands/init.ts') ?? ''
// SoT = src/lib/interactive.ts 의 isInteractive (stdin 축). init 은 로컬 헬퍼 대신 이 SoT 를 쓴다.
const itSrc = read('src/lib/interactive.ts') ?? ''
must(/export function isInteractive/.test(itSrc) && /process\.stdin\.isTTY/.test(itSrc), 'isInteractive SoT (stdin 축)')
must(/from '\.\.\/lib\/interactive\.js'/.test(initSrc) && /isInteractive\(options\)/.test(initSrc), 'init 이 isInteractive SoT 사용')
must(/if\s*\(!noninteractive\)/.test(initSrc), 'collectAnswers 가 비대화형이면 프롬프트 skip')
must(/DEFAULT_TYPE\s*=\s*PROJECT_TYPES\[0\]\.value/.test(initSrc), '타입 미지정 시 기본 타입(webapp) 폴백')
// overwrite 프롬프트도 비대화형 가드.
must((initSrc.match(/!isInteractive\(options\)\s*\n?\s*\?\s*false/g) ?? []).length >= 1 || /noninteractive\s*\n?\s*\?\s*false/.test(initSrc), 'overwrite 프롬프트 비대화형 가드')
// Codex #3: confirmStack/adopt 도 비대화형 가드(!options.yes 단독 금지 — 비-TTY 멈춤 방지).
must(/if\s*\(isInteractive\(options\)\)\s*\{[\s\S]{0,80}confirmStack/.test(initSrc), 'confirmStack 가 isInteractive 가드')
must(/isInteractive\(options\)\s*&&\s*!options\.fromNotion/.test(initSrc), 'adopt 가 isInteractive 가드')
must(!/if\s*\(!options\.yes\)\s*\{[\s\S]{0,80}confirmStack/.test(initSrc), 'confirmStack 에서 옛 !options.yes 단독 가드 제거됨')

if (pass) { console.log('✅ goal 8 gate passes'); process.exit(0) }
console.log('❌ goal 8 gate failed'); process.exit(1)
