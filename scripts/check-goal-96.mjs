#!/usr/bin/env node
// scripts/check-goal-96.mjs — 자동 생성 (vhk goal sync).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 96 gate.')
  process.exit(1)
}

// BOM-safe 읽기: PowerShell Set-Content -Encoding utf8 의 UTF-8 BOM 제거(없으면 throw).
const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 96] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 96 고유 검증 (직접 추가) ───────────────────────────────
// #292-G5: 문서 신선도 경고. checkDocsFreshness 가 존재하고 runPreflight 에 배선됐는지,
// severity 가 'normal'(항상 경고만)인지를 문자열 검증으로 확인한다.
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null

const preflightTs = read('src/lib/preflight.ts')
must(preflightTs?.includes('export function checkDocsFreshness'), 'preflight.ts 가 checkDocsFreshness() export')
must(preflightTs?.includes("export const DOCS_FRESHNESS_FILE = 'docs/state/next-task.md'"), 'DOCS_FRESHNESS_FILE 이 docs/state/next-task.md 로 고정')
must(preflightTs?.includes('export const DOCS_FRESHNESS_WARN_DAYS = 7'), 'DOCS_FRESHNESS_WARN_DAYS 기본값 7')
must(preflightTs?.includes('checkDocsFreshness(deps.run)'), 'runPreflight() 이 checkDocsFreshness(deps.run) 을 반환 배열에 배선')
must(
  /function checkDocsFreshness[\s\S]*?const severity: Severity = 'normal'/.test(preflightTs ?? ''),
  "checkDocsFreshness 의 severity 가 'normal'(항상 경고만, 차단 안 함)"
)
must(
  !/function checkDocsFreshness[\s\S]{0,600}fs\.stat/.test(preflightTs ?? ''),
  'checkDocsFreshness 가 fs.stat(mtime) 을 쓰지 않음(워크트리 checkout 시각 리셋 함정 회피)'
)

const preflightTest = read('tests/preflight.test.ts')
must(preflightTest?.includes('checkDocsFreshness'), 'preflight.test.ts 에 checkDocsFreshness 테스트 존재')
must(preflightTest?.includes('경계') || preflightTest?.includes('off-by-one'), 'preflight.test.ts 에 7일 경계값(off-by-one) 테스트 존재')
must(preflightTest?.includes("toHaveLength(9)"), 'preflight.test.ts 의 runPreflight 통합 테스트가 9개 항목으로 갱신됨')
must(
  /docs freshness[\s\S]{0,400}blocked\)\.toBe\(false\)/.test(preflightTest ?? ''),
  'preflight.test.ts 에 docs freshness warn 이어도 blocked 아님을 확인하는 통합 테스트 존재'
)

if (pass) { console.log('✅ goal 96 gate passes'); process.exit(0) }
console.log('❌ goal 96 gate failed'); process.exit(1)
