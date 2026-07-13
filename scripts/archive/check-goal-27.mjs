#!/usr/bin/env node
// scripts/check-goal-27.mjs — 자동 생성(vhk goal sync) 후 goal 고유 검증 손추가.
// 기본 게이트 = typecheck + (lint) + test + build. goal 고유 검증은 아래 구역.
//
// Env: VHK_GATES_SKIP_DEEP=1  → test + build 스킵 (빠른 typecheck-only 패스)

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const SHIM = new Set(['pnpm', 'npm', 'npx', 'yarn'])
function run(cmd, args) {
  let bin = cmd, argv = args
  if (process.platform === 'win32' && SHIM.has(cmd)) {
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 27 gate.')
  process.exit(1)
}

const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 27] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 27 고유 검증 (silent fallback 린트) ──────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
const lint = read('scripts/check-no-silent-fallback.mjs') ?? ''
must(lint !== '', 'scripts/check-no-silent-fallback.mjs 존재')
must(/const SILENT\s*=/.test(lint) && /return/.test(lint), 'catch-default return 패턴(SILENT) 정의')
must(/vhk-allow-fallback/.test(lint), '화이트리스트 주석(vhk-allow-fallback) 지원')
must(/--strict/.test(lint), '--strict 모드(HARD) 지원 — 기본은 리포트(exit 0)')
must(/process\.exit\(0\)/.test(lint), '리포트 전용 기본 exit 0(baseline 부채 고려)')
must(existsSync('tests/check-no-silent-fallback.test.ts'), 'tests/check-no-silent-fallback.test.ts 존재')
// 게이트 자체 동작 검증 — silent fixture(--strict) FAIL / 정상 PASS
must(run('node', ['scripts/check-no-silent-fallback.mjs', 'src']), '실제 src 리포트 모드 비차단(exit 0)')

if (pass) { console.log('✅ goal 27 gate passes'); process.exit(0) }
console.log('❌ goal 27 gate failed'); process.exit(1)
