#!/usr/bin/env node
// scripts/check-goal-60.mjs — 빈 스텁·누락 게이트 채움 + 메타게이트 (Goal 60).
// 기본 게이트 = typecheck + (lint) + test + build. goal 고유 검증은 아래 구역.
//
// Env: VHK_GATES_SKIP_DEEP=1  → test + build 스킵 (빠른 typecheck-only 패스)

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { findCompletedStubGates, isStubGate } from './_lib.mjs'

// repo root 고정 — 고유 검증이 goals/·scripts/ 를 상대경로로 읽음(check-goal-1.mjs 패턴).
process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), '..'))

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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 60 gate.')
  process.exit(1)
}

const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 60] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 60 고유 검증 (빈 스텁·누락 게이트 채움 + 메타게이트) ───────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null

// 1) 게이트사이드 검출 로직(단일 소스 = _lib.mjs).
const lib = read('scripts/_lib.mjs') ?? ''
must(/export function isStubGate/.test(lib), '_lib.mjs isStubGate export')
must(/export function findCompletedStubGates/.test(lib), '_lib.mjs findCompletedStubGates export')

// 2) check-meta.mjs 가 M.4 로 완료-스텁 검출(메타게이트 통합).
const meta = read('scripts/check-meta.mjs') ?? ''
must(/findCompletedStubGates\(/.test(meta), 'check-meta.mjs 가 M.4 에서 findCompletedStubGates 호출')

// 3) 34-38(DONE-스텁이었던 게이트)이 이제 비스텁(헛통과 DONE 해소).
for (const id of [34, 35, 36, 37, 38]) {
  const gc = read(`scripts/check-goal-${id}.mjs`)
  must(gc != null && !isStubGate(gc), `check-goal-${id}.mjs 비스텁(고유 검증 채움)`)
}

// 4) 회귀 봉쇄 — 검출 로직 행동 테스트.
must(existsSync('tests/meta-gate.test.ts'), 'tests/meta-gate.test.ts 존재(검출기 봉쇄)')

// 5) end-to-end — 라이브 트리에 완료-스텁 0(헛통과 DONE 없음).
const stubs = findCompletedStubGates('goals', 'scripts')
must(stubs.length === 0, `라이브 완료-스텁 0 (검출: ${stubs.map((s) => s.id).join(',') || '없음'})`)

if (pass) { console.log('✅ goal 60 gate passes'); process.exit(0) }
console.log('❌ goal 60 gate failed'); process.exit(1)
