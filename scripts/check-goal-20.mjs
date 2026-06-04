#!/usr/bin/env node
// scripts/check-goal-20.mjs — Goal 20: vhk evolve (설계 등록 단계)
// 현재는 문서 등록 + 기본 게이트만. 구현 단계에서 고유 검증 추가.
//
// Env: VHK_GATES_SKIP_DEEP=1 → test + build 스킵

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const SHIM = new Set(['pnpm', 'npm', 'npx', 'yarn'])
function run(cmd, args) {
  let bin = cmd, argv = args
  if (process.platform === 'win32' && SHIM.has(cmd)) {
    bin = 'cmd.exe'; argv = ['/d', '/s', '/c', cmd + '.cmd', ...args]
  }
  try {
    execFileSync(bin, argv, { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })
    return true
  } catch (e) {
    const out = (e?.stdout?.toString() ?? '') + (e?.stderr?.toString() ?? '')
    if (out.trim()) console.log(out.split('\n').slice(-25).join('\n'))
    return false
  }
}

if (existsSync('.vhk/HARD_STOP')) {
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 20 gate.')
  process.exit(1)
}

// Fix #6+잔존#3: BOM-safe 읽기 — 모든 readFile에 적용(check-goal-18 동일 패턴)
const stripBomStr = (t) => t.charCodeAt(0) === 0xfeff ? t.slice(1) : t
const read = (p) => existsSync(p) ? stripBomStr(readFileSync(p, 'utf-8')) : null
const readJson = (p) => { const t = stripBomStr(readFileSync(p, 'utf-8')); return JSON.parse(t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 20] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
const must = (cond, label) => { console.log((cond ? '    ✓ ' : '    ✗ ') + label); if (!cond) pass = false }

// 공통 게이트
if (scripts.typecheck) gate('typecheck', run(pm, ['run', 'typecheck']))
else if (existsSync('tsconfig.json')) gate('tsc --noEmit', run(pm, pm === 'npm' ? ['exec', '--', 'tsc', '--noEmit'] : ['exec', 'tsc', '--noEmit']))
if (!skipDeep) {
  if (scripts['test:run']) gate('test', run(pm, ['run', 'test:run']))
  else if (scripts.test) gate('test', run(pm, ['run', 'test', '--', '--run']))
  if (scripts.build) gate('build', run(pm, ['run', 'build']))
}

// ─── goal 20 고유 검증 (설계 등록 단계) ──────────────────────────────────
const g20 = read('goals/20-evolve.md') ?? ''
must(g20.includes('id: 20'), 'goals/20-evolve.md: id: 20')
// Fix #4: status 직접 고정 금지 — 유효한 값이면 통과(NOT_STARTED·IN_PROGRESS·DONE·BLOCKED 모두 허용)
const VALID_GOAL_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'BLOCKED']
must(VALID_GOAL_STATUSES.some(s => g20.includes('status: ' + s)), 'goals/20-evolve.md: 유효한 status 값')
must(g20.includes('version: v2.2.0'), 'goals/20-evolve.md: version v2.2.0')
must(g20.includes('depends_on'), 'goals/20-evolve.md: depends_on 선언')
must(g20.includes('goal-19-pattern'), 'goals/20-evolve.md: goal-19-pattern 의존')
must(g20.includes('vhk evolve suggest') && g20.includes('vhk evolve apply'), 'CLI 설계 결정 포함')
must(g20.includes('자동 적용 금지'), '자동 적용 금지 원칙 명시')
must(g20.includes('queue.json'), '.vhk/evolve/queue.json 저장 위치 명시')
// Fix #1 + 잔존#4 + G5 fix: 단어 존재가 아닌 구체 구문으로 의미 검증
must(g20.includes('ensureInteractive()') && g20.includes('가드'), 'C1: apply/undo ensureInteractive() 가드 명시')
// G5: 'sync({ yes: true })' 또는 '비대화형 분기' 구체 문구 체크 — "비대화형" 단독 단어보다 강한 검증
must(g20.includes('sync({ yes: true })') || g20.includes('non-interactive 분기'), 'C1: sync 비대화형 호출 구체 방식 명시')
must(g20.includes('undo') && g20.includes('재sync') && g20.includes('비대화형'), 'C1: undo 재sync 비대화형 호출 명시')
// G1 fix: 단순 단어 공존이 아닌 구체적 복합 구문 체크
must(g20.includes('1건만 undo') || g20.includes('단일 apply 제약'), 'C1: undo 단일 apply 제약 구문 명시')
// G2 fix: negative check → positive check (설명 문맥에서 false positive 방지)
must(g20.includes('pending|rejected|applied'), 'CLI: list status pending|rejected|applied (approved 없음)')
must(g20.includes('원스텝') || g20.includes('one-step'), 'apply 원스텝 명시')
// Fix #5 + 잔존#5: A4 가드 + dismiss vs apply-completed 구분 명시 확인
must(g20.includes('A4') && g20.includes('archived') && g20.includes('apply 거부'), 'A4: 댕글링 참조 가드 명시')
must(g20.includes('dismiss로 archived') || g20.includes('dismiss됨'), 'A4: dismiss vs apply-completed archived 구분 명시')

// Goal 19 의존 코드 존재 확인
must(existsSync('goals/19-pattern.md'), 'goals/19-pattern.md 존재 (Goal 20 의존)')
must(existsSync('src/commands/pattern.ts'), 'src/commands/pattern.ts 존재 (Goal 20 입력)')

// 구현 금지 체크 (이 단계에서는 evolve.ts 없어야 함)
must(!existsSync('src/commands/evolve.ts'), 'src/commands/evolve.ts 미구현 (설계 단계, 구현은 Goal 19 머지 후)')

// C2 자동 적용 경로 없음.
// G3 fix: existsSync 기반 파일 선택 — content falsy(빈 파일)와 파일 없음을 구분.
// evolve.ts 구현 시 이 게이트가 evolve.ts로 자동 전환됨 (existsSync 기반).
const evolveExists = existsSync('src/commands/evolve.ts')
const c2Target = evolveExists ? (read('src/commands/evolve.ts') ?? '') : (read('src/commands/pattern.ts') ?? '')
const c2Label = evolveExists ? 'evolve.ts' : 'pattern.ts'
must(!(/AGENTS\.md|CLAUDE\.md/.test(c2Target) && /writeFileSync|appendFileSync/.test(c2Target)),
     c2Label + ' 가 AGENTS/CLAUDE 직접 write 안 함 (C2 자동적용 금지)')

if (pass) { console.log('✅ goal 20 gate passes'); process.exit(0) }
console.log('❌ goal 20 gate failed'); process.exit(1)
