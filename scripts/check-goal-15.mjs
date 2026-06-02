#!/usr/bin/env node
// scripts/check-goal-15.mjs — 자동 생성 (vhk goal sync).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 15 gate.')
  process.exit(1)
}

// BOM-safe 읽기: PowerShell Set-Content -Encoding utf8 의 UTF-8 BOM 제거(없으면 throw).
const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 15] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 15 고유 검증 (vhk review — 적대적 자기검증) ───────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
const rv = read('src/commands/review.ts') ?? ''
const idx = read('src/index.ts') ?? ''
must(/export function crossCheck/.test(rv) && /export function parseCompletionChecks/.test(rv) && /export async function review/.test(rv), 'review.ts: crossCheck + parseCompletionChecks + review export')
must(/--id/.test(idx) && /command\('review'\)/.test(idx), "index 에 review 커맨드 + --id 옵션")
must(/readJsonFile<VerifyReport>/.test(rv) && /\.\.\.report,\s*review:/.test(rv), 'latest.json BOM-safe 읽기 + review 섹션 병합(새 증거 안 만듦)')
must(/REVIEW_DISCLAIMER/.test(rv) && /보장(이)? 아니/.test(rv) && /reprompt/.test(rv), '"보장 아님" disclaimer + 재질문 프롬프트(거짓 PASS 단언 금지)')
must(/COVERAGE_MIN/.test(rv) && /coverage\s*<\s*COVERAGE_MIN/.test(rv), 'coverage 기반 confidence 캡(증거 없음 ≠ 통과)')
must(/assessFreshness|freshness/.test(rv) && /STALE_AGE_MS/.test(rv) && /stale/.test(rv), '증거 신선도 판정(stale 시 high 금지)')
must(/unmappedCount|미검증/.test(rv), '미검증(unmapped) 완료조건 분류·노출')
must(/checkedCount === 0|체크된 완료조건이 없|vacuous/.test(rv), 'vacuous(체크 0) 가드 — 거짓 high 금지')
must(/REPORT_PATH_REL.*없음|없음.*review|existsSync\(jsonPath\)/.test(rv), 'latest.json 부재 시 안내 분기(자동 생성 안 함)')
must(!/maskSecret|f\.match|findSecretsInLine/.test(rv), 'review 가 시크릿 값 수집 안 함(파일 원문 echo 없음)')
must(existsSync('tests/review.test.ts'), 'review 테스트 존재(거짓완료 회귀 가드 포함)')

if (pass) { console.log('✅ goal 15 gate passes'); process.exit(0) }
console.log('❌ goal 15 gate failed'); process.exit(1)
