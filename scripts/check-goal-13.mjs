#!/usr/bin/env node
// scripts/check-goal-13.mjs — 자동 생성 (vhk goal sync).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 13 gate.')
  process.exit(1)
}

const pkg = existsSync('package.json') ? JSON.parse(readFileSync('package.json', 'utf-8')) : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 13] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 13 고유 검증 (verify 증거화) ───────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
const v = read('src/commands/verify.ts') ?? ''
must(/export function verifyEvidence/.test(v) && /reports[\\/]+latest\.json|REPORT_PATH_REL/.test(v), 'verifyEvidence → .vhk/reports/latest.json')
must(/export function runGates/.test(v) && /execFileSync/.test(v), '게이트 실제 실행(외부 프로세스 종료코드)')
must(/schemaVersion/.test(v) && /aggregateStatus/.test(v) && /'PASS'|"PASS"/.test(v), '리포트 스키마 + 상태 집계(PASS/WARN/FAIL)')
must(/cmd\.exe/.test(v) && /maxBuffer/.test(v), 'Windows 1급(cmd.exe 래핑 + maxBuffer 상향)')
must(/filterSevereFindings/.test(v) && !/maskSecret|f\.match/.test(v), 'secure 게이트 count 만(시크릿 값 미수집)')
must(/ensureNotHardStopped\('verify'\)/.test(v), 'HARD_STOP 거부')
must(/--json/.test(read('src/index.ts') ?? ''), 'index verify --json 옵션')
must(/export function verificationChecklist/.test(v), 'verificationChecklist 보존(기존 호환)')

if (pass) { console.log('✅ goal 13 gate passes'); process.exit(0) }
console.log('❌ goal 13 gate failed'); process.exit(1)
