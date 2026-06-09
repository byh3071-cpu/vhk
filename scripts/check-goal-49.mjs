#!/usr/bin/env node
// scripts/check-goal-49.mjs — 자동 생성 (vhk goal sync).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 49 gate.')
  process.exit(1)
}

// BOM-safe 읽기: PowerShell Set-Content -Encoding utf8 의 UTF-8 BOM 제거(없으면 throw).
const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 49] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 49 고유 검증 (정적 린트 게이트 — eslint type-aware 결함룰 확대) ─────────────
// 재스코프: 카드 원안은 'Biome 도입'이나 #216(tsc/eslint async 게이트)으로 eslint+CI lint 가
// 이미 존재 → 신규 도입이 아닌 '결함룰 확대'(roadmap '도입→확대'). Biome 병존은 noFloatingPromises
// (타입정보 필요, Biome 미흡)와 중복이라 채택 안 함.
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
const eslintCfg = read('eslint.config.js') ?? ''
must(eslintCfg.length > 0, 'eslint.config.js 존재(flat config)')
// tsc(strict)가 못 잡는 type-aware 결함룰 — 스타일 아님.
for (const rule of [
  'no-floating-promises', 'no-misused-promises', 'await-thenable',
  'switch-exhaustiveness-check', 'no-base-to-string', 'prefer-promise-reject-errors',
  'no-unnecessary-type-assertion',
]) {
  must(eslintCfg.includes(rule), `eslint 결함룰 활성: ${rule}`)
}
// CI 블로킹 lint 스텝(위반 시 머지 차단) + 게이트가 호출하는 lint 스크립트.
const ci = read('.github/workflows/ci.yml') ?? ''
must(/pnpm lint|eslint/.test(ci), 'ci.yml 에 lint 블로킹 스텝(머지 차단)')
must(typeof scripts.lint === 'string' && /eslint/.test(scripts.lint), 'package.json lint 스크립트(eslint)')

if (pass) { console.log('✅ goal 49 gate passes'); process.exit(0) }
console.log('❌ goal 49 gate failed'); process.exit(1)
