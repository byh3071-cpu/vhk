#!/usr/bin/env node
// scripts/check-goal-93.mjs — 자동 생성 (vhk goal sync).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 93 gate.')
  process.exit(1)
}

// BOM-safe 읽기: PowerShell Set-Content -Encoding utf8 의 UTF-8 BOM 제거(없으면 throw).
const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 93] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 93 고유 검증 (직접 추가) ───────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null

const mdcTs = read('src/templates/ecosystem-mdc.ts')
must(mdcTs?.includes("export const ECOSYSTEM_MDC_VERSION = '2'"), "ecosystem-mdc.ts ECOSYSTEM_MDC_VERSION 이 '2' (기존 프로젝트 --force 갱신 인식용)")
must(mdcTs?.includes('실행 계층(vhk 명령)은 에이전트 무관'), 'ecosystem-mdc.ts 1번 항목 — 실행 계층은 에이전트 무관 문구 포함')
must(mdcTs?.includes('트리거 계층(훅·vhk-auto)은 현재 Claude Code 전용'), 'ecosystem-mdc.ts 2번 항목 — 트리거 계층은 Claude Code 전용 문구 포함(격차 인정, 은폐 아님)')
must(!/Claude-only/.test(mdcTs ?? ''), 'ecosystem-mdc.ts 에 "Claude-only" 정체성 모순 문구가 완전히 제거됨')
must(mdcTs?.includes('RFC 0057'), 'ecosystem-mdc.ts 가 격차 해소 로드맵(RFC 0057)을 명시')

// 기존 2~5번 항목 내용 보존 확인 (번호만 3~6으로 밀림 — 회귀 가드)
must(mdcTs?.includes('3. **Cursor**'), 'ecosystem-mdc.ts 기존 2번(Cursor) 항목이 3번으로 보존')
must(mdcTs?.includes('4. **Cross-repo / harness**'), 'ecosystem-mdc.ts 기존 3번(Cross-repo/harness) 항목이 4번으로 보존')
must(mdcTs?.includes('5. **Concurrency**'), 'ecosystem-mdc.ts 기존 4번(Concurrency) 항목이 5번으로 보존')
must(mdcTs?.includes('6. **Derived files**'), 'ecosystem-mdc.ts 기존 5번(Derived files) 항목이 6번으로 보존')
must(
  mdcTs?.includes('memory/core/ecosystem-contract.yaml') && mdcTs?.includes('memory/core/inheritance-registry.yaml'),
  'ecosystem-mdc.ts cross-repo 계약 참조 문구 보존(회귀 없음)',
)

// 회귀 테스트 존재 확인(TDD 산출물 자체가 지워지지 않았는지)
const injectTestTs = read('tests/inject-bootstrap.test.ts')
must(
  injectTestTs?.includes("toContain('실행 계층(vhk 명령)은 에이전트 무관')") && injectTestTs?.includes("not.toContain('Claude-only')"),
  'tests/inject-bootstrap.test.ts 에 goal 93 회귀 가드(신규 문구 포함 + Claude-only 부재) 테스트 존재',
)

if (pass) { console.log('✅ goal 93 gate passes'); process.exit(0) }
console.log('❌ goal 93 gate failed'); process.exit(1)
