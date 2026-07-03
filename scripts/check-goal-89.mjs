#!/usr/bin/env node
// scripts/check-goal-89.mjs — 자동 생성 (vhk goal sync).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 89 gate.')
  process.exit(1)
}

// BOM-safe 읽기: PowerShell Set-Content -Encoding utf8 의 UTF-8 BOM 제거(없으면 throw).
const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 89] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 89 고유 검증 (직접 추가) ───────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null

const initTs = read('src/commands/init.ts')
must(initTs?.includes('ensureCustomizationMarker'), 'init.ts 에 ensureCustomizationMarker 존재')
must(initTs?.includes('ensureSessionStartHook'), 'init.ts 에 ensureSessionStartHook 존재')
must(
  initTs?.includes('${CLAUDE_PROJECT_DIR}') && initTs?.includes('"${CLAUDE_PROJECT_DIR}/.vhk/hooks/customization-check.mjs"'),
  '훅 command 가 ${CLAUDE_PROJECT_DIR} 절대경로 + 따옴표 보호 (실전검증 감사 2026-07-03 반영)'
)
must(
  /SESSION_START_ENTRIES = \['startup', 'resume'\]/.test(initTs ?? ''),
  'SessionStart matcher 가 파이프 아닌 startup·resume 단일값 2개 entry 로 분리'
)

const hookTs = read('src/templates/customization-hook.ts')
must(hookTs?.includes('hookSpecificOutput') && hookTs?.includes('additionalContext'), 'customization-hook.ts 가 올바른 SessionStart 응답 스키마 사용')
must(hookTs?.includes('customization-done'), 'customization-hook.ts 가 done 마커 생성을 지시')

const initTest = read('tests/init.test.ts')
must(
  initTest?.includes("toEqual(['startup', 'resume'])") && initTest?.includes('CLAUDE_PROJECT_DIR'),
  'init.test.ts 에 훅 신뢰성 보강(경로·matcher) 회귀 가드 존재'
)

const specMd = read('docs/spec.md')
must(specMd?.includes('spec_version: "1.2"'), 'docs/spec.md 가 1.2 로 갱신됨')

if (pass) { console.log('✅ goal 89 gate passes'); process.exit(0) }
console.log('❌ goal 89 gate failed'); process.exit(1)
