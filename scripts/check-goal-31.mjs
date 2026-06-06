#!/usr/bin/env node
// scripts/check-goal-31.mjs — 자동 생성 (vhk goal sync).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 31 gate.')
  process.exit(1)
}

// BOM-safe 읽기: PowerShell Set-Content -Encoding utf8 의 UTF-8 BOM 제거(없으면 throw).
const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 31] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 31 고유 검증 (vhk doctor — Phase 1) ───────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
// 산출물 구조
for (const f of ['types', 'runner', 'report']) {
  must(existsSync(`src/doctor/${f}.ts`), `src/doctor/${f}.ts 존재`)
}
for (const d of ['node', 'pnpm', 'git', 'os']) {
  must(existsSync(`src/doctor/diagnostics/${d}.ts`), `diagnostics/${d}.ts 존재 (Phase 1)`)
}
must(existsSync('tests/doctor/runner.test.ts'), 'tests/doctor/ 단위테스트 존재')
// 재사용: node 진단은 Goal 29 nodeMeetsShimSafe import(이중 구현 금지)
must(/nodeMeetsShimSafe/.test(read('src/doctor/diagnostics/node.ts') ?? ''), 'node 진단이 nodeMeetsShimSafe 재사용')
// runner: 병렬 + throw→fail 격리
const runner = read('src/doctor/runner.ts') ?? ''
must(/Promise\.all/.test(runner), 'runner 가 Promise.all 병렬 실행')
must(/try/.test(runner) && /catch/.test(runner), 'runner 가 try/catch 로 throw 격리')
// 불변규칙: 자동 수정 없음(진단만) — doctor 엔진에 파일 쓰기/복사 없음
for (const f of ['runner', 'report', 'diagnostics/node', 'diagnostics/git']) {
  const src = read(`src/doctor/${f}.ts`) ?? ''
  must(!/writeFileSync|copyFileSync|execSync/.test(src), `${f}.ts 자동수정/execSync 없음(진단만)`)
}
// 흡수: 기존 doctor.ts export 보존(중복 명령 금지) + HARD_STOP 가드
const doc = read('src/commands/doctor.ts') ?? ''
must(/export \{ fetchLatestNpmVersion, compareSemver \}|compareSemver/.test(doc), 'doctor.ts compareSemver export 보존')
must(/checkCommand/.test(doc), 'doctor.ts checkCommand export 보존(test 호환)')
must(/ensureNotHardStopped/.test(doc), 'doctor.ts HARD_STOP 가드')
must(/runDiagnostics/.test(doc), 'doctor.ts 가 새 진단 엔진 흡수')

if (pass) { console.log('✅ goal 31 gate passes'); process.exit(0) }
console.log('❌ goal 31 gate failed'); process.exit(1)
