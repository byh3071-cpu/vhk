#!/usr/bin/env node
// scripts/check-goal-70.mjs — 자동 생성 (vhk goal sync).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 70 gate.')
  process.exit(1)
}

// BOM-safe 읽기: PowerShell Set-Content -Encoding utf8 의 UTF-8 BOM 제거(없으면 throw).
const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 70] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 70 고유 검증 ───────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
const srv = read('src/mcp/server.ts') ?? ''
must(/export const HIGH_RISK_MCP_TOOLS/.test(srv), 'HIGH_RISK_MCP_TOOLS 레지스트리 export (risk_level SoT)')
must(/'save'[\s\S]*?'undo'|'undo'[\s\S]*?'save'/.test(srv.split('HIGH_RISK_MCP_TOOLS')[1]?.slice(0, 120) ?? ''), '레지스트리에 save·undo')
// save 가 confirm 옵트인(미리보기 기본) 가지는지 — confirm 파라미터 + 미실행 분기
must(/async \(\{ message, confirm \}\)/.test(srv), 'save 핸들러 confirm 파라미터')
must(/if \(!confirm\)[\s\S]*?미리보기/.test(srv), 'save confirm 없으면 미리보기 분기')
must(/기존 tool API 시그니처 변경 0|message.*optional|optional.*message/.test(srv) || /message: z\.string\(\)\.optional/.test(srv), 'save message 시그니처 불변(additive)')
// ADR + RULES.md 템플릿
must(existsSync('docs/adr/ADR-005-mcp-high-risk-optin.md'), 'ADR-005 작성')
must(/MCP 고위험 도구.*confirm|옵트인/.test(read('src/templates/rules-md.ts') ?? ''), 'RULES.md 템플릿 MCP 옵트인 섹션')
// 회귀 가드 테스트 존재
must(existsSync('tests/mcp-optin.test.ts'), 'mcp-optin 회귀 테스트')

if (pass) { console.log('✅ goal 70 gate passes'); process.exit(0) }
console.log('❌ goal 70 gate failed'); process.exit(1)
