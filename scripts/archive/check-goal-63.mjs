#!/usr/bin/env node
// scripts/check-goal-63.mjs — 자동 생성 (vhk goal sync).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 63 gate.')
  process.exit(1)
}

// BOM-safe 읽기: PowerShell Set-Content -Encoding utf8 의 UTF-8 BOM 제거(없으면 throw).
const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 63] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 63 고유 검증 (직접 추가) ───────────────────────────────
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf-8') : null)
// 바인딩까지 단언(주석 오탐 회피): syncCheck 가 export 되고 buildSyncPlan 을 재사용하는지.
const syncSrc = read('src/commands/sync.ts') ?? ''
must(/export function syncCheck\(/.test(syncSrc), 'sync.ts 에 syncCheck export')
const syncCheckIdx = syncSrc.indexOf('export function syncCheck')
must(syncCheckIdx !== -1 && /const plan = buildSyncPlan\(/.test(syncSrc.slice(syncCheckIdx)), 'syncCheck 가 buildSyncPlan 재사용(검사기 drift 0)')
must(/process\.exitCode = 1/.test(syncSrc), 'check 모드 비정상 종료코드(exitCode 대입 — process.exit 금지 준수)')
must(/--check/.test(read('src/index.ts') ?? ''), 'index.ts 에 --check 옵션 등록')
must(/checkPass/.test(read('src/i18n/ko.ts') ?? ''), 'ko.ts 검사 메시지 존재')
must(existsSync('tests/sync-check.test.ts'), '전용 테스트 존재')
// 라이브 e2e: 현 레포는 동기화 상태여야 --check 가 exit 0 (drift 시 이 게이트 자체가 FAIL = 의도)
gate('vhk sync --check (live)', run('node', ['dist/index.js', 'sync', '--check']))

if (pass) { console.log('✅ goal 63 gate passes'); process.exit(0) }
console.log('❌ goal 63 gate failed'); process.exit(1)
