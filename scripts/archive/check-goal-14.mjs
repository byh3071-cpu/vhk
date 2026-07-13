#!/usr/bin/env node
// scripts/check-goal-14.mjs — 자동 생성 (vhk goal sync).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 14 gate.')
  process.exit(1)
}

const pkg = existsSync('package.json') ? JSON.parse(readFileSync('package.json', 'utf-8')) : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 14] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 14 고유 검증 (verify --report → 사람용 정적 HTML) ───────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
const vr = read('src/commands/verify-report.ts') ?? ''
const vf = read('src/commands/verify.ts') ?? ''
const idx = read('src/index.ts') ?? ''
must(/export function renderReportHtml/.test(vr) && /export function escapeHtml/.test(vr), 'renderReportHtml + escapeHtml export (순수 렌더러)')
must(!/https?:\/\//.test(vr) && !/<script\s+src/i.test(vr), '렌더러 외부 의존 0 (URL/외부 스크립트 없음 — 오프라인)')
must(/--report/.test(idx) && /--open/.test(idx), 'index 에 verify --report / --open 옵션')
must(/REPORT_HTML_PATH_REL/.test(vf) && /readJsonFile<VerifyReport>/.test(vf), 'latest.html 쓰기 + latest.json BOM-safe 읽기(readJsonFile)')
must(/renderReportHtml\(/.test(vf), 'verify 가 renderReportHtml 로 렌더(새 증거 안 만듦)')
must(/isInteractive\(\)/.test(vf) && /자동 스킵/.test(vf), '--open 비대화형/CI/MCP 자동 스킵')
must(existsSync('tests/verify-report.test.ts'), 'verify-report 테스트 존재(FAIL 회귀 가드 포함)')

if (pass) { console.log('✅ goal 14 gate passes'); process.exit(0) }
console.log('❌ goal 14 gate failed'); process.exit(1)
