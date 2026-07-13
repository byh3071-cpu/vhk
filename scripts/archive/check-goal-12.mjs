#!/usr/bin/env node
// scripts/check-goal-12.mjs — 자동 생성 (vhk goal sync).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 12 gate.')
  process.exit(1)
}

const pkg = existsSync('package.json') ? JSON.parse(readFileSync('package.json', 'utf-8')) : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 12] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 12 고유 검증 (비대화형 가드 P2) ───────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
// ① auto-default: theme 덮어쓰기 확인을 promptOrDefault(stdin SoT)로 마이그 + --yes
must(/promptOrDefault/.test(read('src/commands/theme.ts') ?? ''), 'theme 비대화형 기본값 (① auto-default)')
must(/--yes|options\?\.yes/.test(read('src/commands/theme.ts') ?? ''), 'theme --yes 강제 덮어쓰기')
must(/theme.*--yes|--yes.*theme/s.test(read('src/index.ts') ?? '') || /\.command\('theme'\)[\s\S]{0,200}--yes/.test(read('src/index.ts') ?? ''), 'index theme --yes 옵션 등록')
// ② refuse-essential: ship 진입 가드
must(/ensureInteractive\(/.test(read('src/commands/ship.ts') ?? ''), 'ship essential 진입거부 (② refuse)')
// sync 확인 축 = stdin SoT (stdout 아님 — E8/R1)
const syncSrc = read('src/commands/sync.ts') ?? ''
must(/promptOrDefault/.test(syncSrc) && /isInteractive/.test(syncSrc), 'sync 확인 축 stdin SoT 마이그 (E8)')
must(!/!!process\.stdout\.isTTY && !opts\.yes/.test(syncSrc), 'sync 구 stdout 축 제거')
// S5 결정: save 는 strict-extra 유지(high-risk 승격 안 함)
const riskSrc = read('src/lib/risk-policy.ts') ?? ''
must(/STRICT_EXTRA_ACTIONS[\s\S]*?'save'/.test(riskSrc), 'save strict-extra 유지 (S5)')
must(!/HIGH_RISK_ACTIONS[\s\S]*?'save'[\s\S]*?\] as const/.test(riskSrc), 'save 는 HIGH_RISK 승격 안 함 (S5)')

if (pass) { console.log('✅ goal 12 gate passes'); process.exit(0) }
console.log('❌ goal 12 gate failed'); process.exit(1)
