#!/usr/bin/env node
// scripts/check-goal-84.mjs — goal 84: doctor/status next-step 맥락 인지 (신규 vs 기존 레포 분기).
// 기본 게이트 = typecheck + (lint) + test + build. goal 고유 검증은 아래 구역.
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
    execFileSync(bin, argv, { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })
    return true
  } catch (e) {
    const out = (e?.stdout?.toString() ?? '') + (e?.stderr?.toString() ?? '')
    if (out.trim()) console.log(out.split('\n').slice(-25).join('\n'))
    return false
  }
}

if (existsSync('.vhk/HARD_STOP')) {
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 84 gate.')
  process.exit(1)
}

const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 84] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
const must = (cond, label) => { console.log((cond ? '    ✓ ' : '    ✗ ') + label); if (!cond) pass = false }

if (scripts.typecheck) gate('typecheck', run(pm, ['run', 'typecheck']))
else if (existsSync('tsconfig.json')) gate('tsc --noEmit', run(pm, pm === 'npm' ? ['exec', '--', 'tsc', '--noEmit'] : ['exec', 'tsc', '--noEmit']))
if (scripts.lint) gate('lint', run(pm, ['run', 'lint']))
if (!skipDeep) {
  if (scripts['test:run']) gate('test', run(pm, ['run', 'test:run']))
  else if (scripts.test && /vitest/.test(scripts.test)) gate('test', run(pm, ['run', 'test', '--', '--run']))
  else if (scripts.test) gate('test', run(pm, ['run', 'test']))
  if (scripts.build) gate('build', run(pm, ['run', 'build']))
}

// ─── goal 84 고유 검증 ───────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
const mat = read('src/lib/project-maturity.ts') ?? ''
must(/export function classifyMaturity/.test(mat), 'classifyMaturity() 순수 분류 export')
must(/export function gatherMaturitySignals/.test(mat), 'gatherMaturitySignals() 신호 수집(gitOut 재사용)')
must(/export function projectMaturity/.test(mat), 'projectMaturity() 편의 래퍼 export')
must(/contextExists/.test(mat) && /commitCount/.test(mat), '신호 = .vhk/context 존재 + 커밋 수')
// 실제 호출(execSync(...)) 또는 child_process import 만 차단 — 주석의 단어는 무관.
must(!/execSync\s*\(/.test(mat) && !/from 'node:child_process'/.test(mat), '신규 execSync 호출 미사용(gitOut 단일통로)')

const doc = read('src/commands/doctor.ts') ?? ''
must(/export function selectDoctorOkNextStep/.test(doc), 'doctor selectDoctorOkNextStep() 분기 함수')
must(/selectDoctorOkNextStep\(projectMaturity\(cwd\)\)/.test(doc), 'doctor all-OK 분기가 maturity 로 next-step 선택')
must(/maturity === 'established'[\s\S]*?command: 'vhk work'/.test(doc), 'established → vhk work(시작 아님, D9 해소)')
must(/command: 'vhk 시작'/.test(doc), 'new → vhk 시작(온보딩 유지 — 퇴행 0)')

const st = read('src/commands/status.ts') ?? ''
must(/maturity: 'new' \| 'established' = 'established'/.test(st), 'selectStatusNextStep maturity 인자(기본 established — 하위호환)')
must(/maturity === 'new'[\s\S]*?command: 'vhk 시작'/.test(st), 'status new → 온보딩(vhk 시작)')
must(/selectStatusNextStep\(hasChanges, projectMaturity\(process\.cwd\(\)\)\)/.test(st), 'status 호출부가 maturity 전달(doctor 와 동일 cwd 앵커)')

must(/nextNewRepoMessage/.test(read('src/i18n/ko.ts') ?? ''), 'ko.ts status.nextNewRepoMessage')
must(existsSync('tests/project-maturity.test.ts'), '회귀 테스트 tests/project-maturity.test.ts')

const goal = read('goals/84-contextual-next-step.md') ?? ''
must(/status:\s*DONE/.test(goal), 'goals/84 status DONE')

if (pass) { console.log('✅ goal 84 gate passes'); process.exit(0) }
console.log('❌ goal 84 gate failed'); process.exit(1)
