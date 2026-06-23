#!/usr/bin/env node
// scripts/check-goal-85.mjs — 자동 생성 (vhk goal sync).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 85 gate.')
  process.exit(1)
}

// BOM-safe 읽기: PowerShell Set-Content -Encoding utf8 의 UTF-8 BOM 제거(없으면 throw).
const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 85] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 85 고유 검증 (#315 자기참조 봉인 — 자기 산출 추적파일 dirty 제외) ───────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null

// ① 화이트리스트 SoT 단일 모듈(분산 금지)
const sot = read('src/lib/self-tracked.ts') ?? ''
must(/export const SELF_TRACKED_FILES/.test(sot), 'self-tracked.ts: 화이트리스트 SoT 상수 SELF_TRACKED_FILES')
must(/\.vhk\/ledger\.jsonl/.test(sot), 'self-tracked.ts: .vhk/ledger.jsonl 명시(증거 원장)')
must(/\.vhk\/events\//.test(sot), 'self-tracked.ts: .vhk/events/ 명시(행동 원장)')
must(/export function filterSelfTrackedLines/.test(sot), 'self-tracked.ts: filterSelfTrackedLines 필터 export(재사용 가능 SoT)')
// 한계 명시(정직) — 자기참조 사각지대를 주석에 박았는가
must(/위조|날조|조작/.test(sot), 'self-tracked.ts: 자기참조 사각지대(위조 못 잡음) 한계 주석')

// ② dirty 판정 경로가 SoT 필터를 사용(getCommitInfo)
const gitRepo = read('src/lib/git-repo.ts') ?? ''
must(/filterSelfTrackedLines/.test(gitRepo), 'git-repo.ts: getCommitInfo 가 filterSelfTrackedLines 로 자기파일 제외')
must(/--untracked-files=all/.test(gitRepo), 'git-repo.ts: -uall 로 미추적 디렉터리 collapse 방지(개별 경로 필터)')
must(/--porcelain/.test(gitRepo), 'git-repo.ts: dirty 판정 git status --porcelain 유지(goal 44 호환)')

// ③ 사각지대 방지 회귀 테스트 존재(자기파일 제외하되 소스·기타 .vhk 는 dirty 유지)
must(existsSync('tests/self-tracked.test.ts'), 'tests/self-tracked.test.ts 존재(과확장 0 고정)')
const t = read('tests/verify-sha.test.ts') ?? ''
must(/퇴행 0|과확장 0/.test(t), 'verify-sha.test.ts: 퇴행·과확장 0 회귀 테스트(진짜 소스/기타 .vhk 는 dirty)')

if (pass) { console.log('✅ goal 85 gate passes'); process.exit(0) }
console.log('❌ goal 85 gate failed'); process.exit(1)
