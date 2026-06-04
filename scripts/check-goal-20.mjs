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

const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
const pkg = existsSync('package.json') ? JSON.parse(readFileSync('package.json', 'utf-8').replace(/^﻿/, '')) : {}
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
must(g20.includes('status: NOT_STARTED'), 'goals/20-evolve.md: status NOT_STARTED')
must(g20.includes('version: v2.2.0'), 'goals/20-evolve.md: version v2.2.0')
must(g20.includes('depends_on'), 'goals/20-evolve.md: depends_on 선언')
must(g20.includes('goal-19-pattern'), 'goals/20-evolve.md: goal-19-pattern 의존')
must(g20.includes('vhk evolve suggest') && g20.includes('vhk evolve apply'), 'CLI 설계 결정 포함')
must(g20.includes('자동 적용 금지'), '자동 적용 금지 원칙 명시')
must(g20.includes('queue.json'), '.vhk/evolve/queue.json 저장 위치 명시')

// Goal 19 의존 코드 존재 확인
must(existsSync('goals/19-pattern.md'), 'goals/19-pattern.md 존재 (Goal 20 의존)')
must(existsSync('src/commands/pattern.ts'), 'src/commands/pattern.ts 존재 (Goal 20 입력)')

// 구현 금지 체크 (이 단계에서는 evolve.ts 없어야 함)
must(!existsSync('src/commands/evolve.ts'), 'src/commands/evolve.ts 미구현 (설계 단계, 구현은 Goal 19 머지 후)')

// 자동 적용 경로 없음 (설계 단계에서도 grep 확인)
const ptTxt = read('src/commands/pattern.ts') ?? ''
must(!/AGENTS\.md|CLAUDE\.md/.test(ptTxt) || !/writeFileSync|appendFileSync/.test(ptTxt), 'pattern.ts 가 AGENTS/CLAUDE 직접 write 안 함')

if (pass) { console.log('✅ goal 20 gate passes'); process.exit(0) }
console.log('❌ goal 20 gate failed'); process.exit(1)
