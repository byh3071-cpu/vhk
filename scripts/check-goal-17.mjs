#!/usr/bin/env node
// scripts/check-goal-17.mjs — 자동 생성 (vhk goal sync).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 17 gate.')
  process.exit(1)
}

// BOM-safe 읽기: PowerShell Set-Content -Encoding utf8 의 UTF-8 BOM 제거(없으면 throw).
const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 17] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 17 고유 검증 (vhk mission — Mission Contract) ───────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
const ms = read('src/commands/mission.ts') ?? ''
const idx = read('src/index.ts') ?? ''
must(/export function checkMission/.test(ms) && /export function globToRegExp/.test(ms), 'mission.ts: checkMission + globToRegExp 순수 함수 export')
must(/missionSet/.test(ms) && /missionShow/.test(ms) && /missionCheck/.test(ms) && /missionClear/.test(ms), 'set/show/check/clear 4개 서브커맨드')
must(/MISSION_PATH_REL/.test(ms) && /mission\.json/.test(ms) && !/REPORT_PATH_REL/.test(ms), '.vhk/mission.json 별도 네임스페이스 (verify 의 REPORT_PATH_REL 미사용)')
must(/readJsonFile<Mission>/.test(ms), 'mission.json BOM-safe 읽기(readJsonFile)')
must(/MISSION_DISCLAIMER/.test(ms) && /경로 glob|의미/.test(ms), '"경로 glob 기준 — 의미 검증 아님" disclaimer')
must(/violations\.length > 0 \? 1 : 0/.test(ms), 'forbidden 위반 시 exit 1 (scope 경고는 0)')
must(/command\('mission'\)/.test(idx) && /command\('set'\)/.test(idx) && /command\('check'\)/.test(idx), 'index 에 mission + set/check/clear 등록')
must(/import \{ simpleGit \}/.test(ms) && !/minimatch|picomatch/.test(ms), 'glob 자체 구현(외부 의존 0) + simple-git 변경파일')
must(existsSync('tests/mission.test.ts'), 'mission 테스트 존재(checkMission 회귀 가드)')

if (pass) { console.log('✅ goal 17 gate passes'); process.exit(0) }
console.log('❌ goal 17 gate failed'); process.exit(1)
