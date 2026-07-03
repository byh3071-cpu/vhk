#!/usr/bin/env node
// scripts/check-goal-91.mjs — 자동 생성 (vhk goal sync).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 91 gate.')
  process.exit(1)
}

// BOM-safe 읽기: PowerShell Set-Content -Encoding utf8 의 UTF-8 BOM 제거(없으면 throw).
const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 91] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 91 고유 검증 (직접 추가) ───────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null

const vhkDirTs = read('src/templates/vhk-dir.ts')
must(
  /core: \{ ?source: 'live' \| 'bundled'; ?version: string ?\}/.test(vhkDirTs ?? ''),
  'vhk-dir.ts VHK_CONTEXT_SEED 시그니처에 4번째 인자(core: {source, version}) 존재'
)
must(vhkDirTs?.includes("version === 'unknown' ? '버전 미상'"), 'vhk-dir.ts — version=unknown 코스메틱 폴백 존재 (critic Low)')

const initTs = read('src/commands/init.ts')
must(initTs?.includes('loadCoreRuleset'), 'init.ts 가 loadCoreRuleset import')
must(
  /VHK_CONTEXT_SEED\(name, type \|\| 'unknown', stack, \{/.test(initTs ?? ''),
  "init.ts generateFiles() 가 VHK_CONTEXT_SEED 4번째 인자 배선"
)
must(
  initTs?.includes("coreRulesCheck.source === 'bundled'") && initTs?.includes('ko.init.coreRulesBundledWarn'),
  'init() 꼬리 — source=bundled 일 때 경고 출력'
)

const injectBootstrapTs = read('src/lib/inject-bootstrap.ts')
must(
  /VHK_CONTEXT_SEED\(name, 'tier-s-ecosystem', \['see RULES\.md'\], \{/.test(injectBootstrapTs ?? ''),
  'inject-bootstrap.ts generateTierSContextSeed() 도 VHK_CONTEXT_SEED 4번째 인자 배선 (2번째 호출처)'
)

const contextTs = read('src/commands/context.ts')
must(contextTs?.includes("loadCoreRuleset"), 'context.ts 가 loadCoreRuleset import (vhk start 5단계 경로 커버)')
must(contextTs?.includes('## 헌법(core-rules) 소스'), 'context.ts 가 헌법 소스 섹션을 렌더')

const koTs = read('src/i18n/ko.ts')
// critic 지적(2026-07-03): 초안 문구가 'vhk sync 를 다시 실행하세요'였으나 sync.ts 는
// .agents/CORE-RULES.md 를 절대 안 건드림(SYNC_TARGETS 에 없음) — 실제 재생성기는
// inject-bootstrap.ts 뿐이라 잘못된 안내였다. 회귀 가드로 정확한 명령을 고정.
must(koTs?.includes('vhk inject-bootstrap --force'), "ko.ts coreRulesBundledWarn 이 올바른 재생성 명령 안내 (vhk sync 아님)")
must(koTs?.includes('미설정 또는 라이브 파일 읽기 실패'), 'ko.ts coreRulesBundledWarn 이 "미설정" 단정 안 함 (읽기실패 케이스 포괄)')

const warnTest = read('tests/init-core-rules-warn.test.ts')
must(
  warnTest?.includes('vhk inject-bootstrap --force') && warnTest?.includes("not.toContain('vhk sync')"),
  'init-core-rules-warn.test.ts 에 올바른 명령 회귀 가드 테스트 존재'
)

if (pass) { console.log('✅ goal 91 gate passes'); process.exit(0) }
console.log('❌ goal 91 gate failed'); process.exit(1)
