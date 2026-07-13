#!/usr/bin/env node
// scripts/check-goal-32.mjs — 자동 생성 (vhk goal sync).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 32 gate.')
  process.exit(1)
}

// BOM-safe 읽기: PowerShell Set-Content -Encoding utf8 의 UTF-8 BOM 제거(없으면 throw).
const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 32] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 32 고유 검증 (vhk standup — Phase 1) ───────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
// 산출물(daily 모듈 = goal 33 today 공유)
for (const f of ['types', 'lastActiveDay', 'gitlog', 'goals', 'standup']) {
  must(existsSync(`src/daily/${f}.ts`), `src/daily/${f}.ts 존재`)
}
must(existsSync('src/commands/standup.ts'), 'src/commands/standup.ts (CLI) 존재')
must(existsSync('tests/daily/standup.test.ts'), 'tests/daily/ 단위테스트 존재')
// 재사용(이중 구현 금지): gitlog→getRecentCommits, standup→listGoals+localDate
must(/getRecentCommits/.test(read('src/daily/gitlog.ts') ?? ''), 'gitlog 가 getRecentCommits 재사용(off-by-one withMidnight 공유)')
const standup = read('src/daily/standup.ts') ?? ''
must(/listGoals/.test(standup), 'standup 이 listGoals 재사용')
must(/localDate/.test(standup), 'standup 이 localDate(KST) 재사용')
// DevLog 실패해도 git+goal 로 리포트 생성(Phase 1 폴백) — buildStandupReport 순수 + try/catch
must(/buildStandupReport/.test(standup), 'buildStandupReport(순수 병합) 존재')
must(/catch/.test(standup), 'standup 수집부 try/catch(git/goal 실패 폴백)')
// 불변규칙: daily 전 파일 execSync 0 + raw JSON.parse 0
for (const f of ['types', 'lastActiveDay', 'gitlog', 'goals', 'standup']) {
  const src = read(`src/daily/${f}.ts`) ?? ''
  must(!/execSync/.test(src), `daily/${f}.ts execSync 없음`)
  must(!/JSON\.parse/.test(src), `daily/${f}.ts raw JSON.parse 없음`)
}
// 읽기전용 — HARD_STOP 가드 없음(가드 docstring: 읽기전용 제외 — doctor 와 동일)
must(!/ensureNotHardStopped/.test(read('src/commands/standup.ts') ?? ''), 'standup 은 HARD_STOP 가드 없음(읽기전용)')
// CLI 단일소스 등록
must(/standup/.test(read('src/index.ts') ?? ''), 'index.ts 에 standup 등록')
must(/standup/.test(read('src/lib/command-registry.ts') ?? ''), 'command-registry 등록')
must(/standup/.test(read('src/lib/cli-args.ts') ?? ''), 'cli-args 등록')
// Phase 2: 로컬 docs/log DevLog 연동(공유 devlog 모듈)
must(existsSync('src/daily/devlog.ts'), 'src/daily/devlog.ts 존재 (Phase 2 공유)')
must(/readDevLogs/.test(read('src/daily/standup.ts') ?? ''), 'standup 이 readDevLogs 로 DevLog 연동')
must(existsSync('tests/daily/devlog.test.ts'), 'devlog 단위테스트 존재')

// ─── goal 32 Phase 3 검증 (--if-stale 하루 1회 + 터미널 자동실행 앵커) ──────────
must(existsSync('src/daily/shown-state.ts'), 'src/daily/shown-state.ts 존재 (하루 1회 상태)')
must(existsSync('src/daily/anchor.ts'), 'src/daily/anchor.ts 존재 (앵커 줄 빌더)')
must(existsSync('tests/daily/shown-state.test.ts'), 'shown-state 단위테스트 존재')
must(existsSync('tests/daily/anchor.test.ts'), 'anchor 단위테스트 존재')
const shownState = read('src/daily/shown-state.ts') ?? ''
must(/export function shouldShow/.test(shownState), 'shouldShow 순수함수 존재')
must(!/execSync/.test(shownState), 'shown-state execSync 없음')
must(!/JSON\.parse/.test(shownState), 'shown-state raw JSON.parse 없음 (readJsonFile 사용)')
must(/atomicWriteFile/.test(shownState), 'shown-state 원자적 쓰기 사용')
const anchorSrc = read('src/daily/anchor.ts') ?? ''
must(!/execSync/.test(anchorSrc), 'anchor execSync 없음')
must(!/writeFileSync|appendFileSync|atomicWriteFile/.test(anchorSrc), 'anchor 파일 쓰기 0 (rc 자동수정 금지)')
const standupCmd = read('src/commands/standup.ts') ?? ''
must(/ifStale/.test(standupCmd), 'standup 이 --if-stale 처리')
must(/installAnchor/.test(standupCmd), 'standup 이 --install-anchor 처리')
must(/shouldShow/.test(standupCmd), 'standup 이 shouldShow 로 하루 1회 판정')
const idx = read('src/index.ts') ?? ''
must(/--if-stale/.test(idx), 'index.ts 에 --if-stale 옵션 등록')
must(/--install-anchor/.test(idx), 'index.ts 에 --install-anchor 옵션 등록')

if (pass) { console.log('✅ goal 32 gate passes'); process.exit(0) }
console.log('❌ goal 32 gate failed'); process.exit(1)
