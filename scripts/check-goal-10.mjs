#!/usr/bin/env node
// scripts/check-goal-10.mjs — 자동 생성 (vhk goal sync).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 10 gate.')
  process.exit(1)
}

const pkg = existsSync('package.json') ? JSON.parse(readFileSync('package.json', 'utf-8')) : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 10] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 10 고유 검증 (context 발견성) ─────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
// (a) next-step 발견성: 헬퍼 존재 + status 가 호출 + ko 메시지가 vhk context 안내.
const nsSrc = read('src/lib/next-step.ts') ?? ''
must(/export function printContextResumeHint/.test(nsSrc), 'printContextResumeHint 헬퍼 존재')
must(/checkContextDrift\(/.test(nsSrc), 'stale 판정은 검증된 checkContextDrift 재사용 (.git/HEAD mtime 아님)')
const statusSrc = read('src/commands/status.ts') ?? ''
must(/printContextResumeHint\(\)/.test(statusSrc), 'status 가 cwd 기준으로 context 힌트 노출(gitRoot 앵커 불일치 제거)')
const koSrc = read('src/i18n/ko.ts') ?? ''
must(/resumeMissing[\s\S]{0,80}vhk context/.test(koSrc), 'ko 메시지가 vhk context 안내')
// (b) MCP: context 가 MCP 툴로 등록 (이미 DONE 인 부분 — 회귀 가드).
const mcpSrc = read('src/mcp/server.ts') ?? ''
must(/registerTool\(\s*\n?\s*'context'/.test(mcpSrc), "context 가 MCP 툴로 등록(registerTool 'context')")

if (pass) { console.log('✅ goal 10 gate passes'); process.exit(0) }
console.log('❌ goal 10 gate failed'); process.exit(1)
