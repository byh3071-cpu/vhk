#!/usr/bin/env node
// scripts/check-goal-78.mjs — goal 78: goal next 비파괴화 + vhk goal peek (조회/변경 분리).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 78 gate.')
  process.exit(1)
}

const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 78] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 78 고유 검증 ───────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
const g = read('src/commands/goal.ts') ?? ''
must(/export async function goalPeek/.test(g), 'goalPeek 읽기전용 핸들러 export')
must(/saveBackup\(/.test(g), 'goalNext 가 saveBackup 으로 덮어쓰기 전 백업')
must(/cwd: string = process\.cwd\(\)/.test(g), 'goalNext/goalPeek cwd 인자(테스트 격리 + chdir 회피)')
const idx = read('src/index.ts') ?? ''
must(/\.command\('peek'\)/.test(idx) && /미리보기/.test(idx), 'index.ts goal peek 등록 + 한글별칭')
must(/goalPeek/.test(idx), 'index.ts goalPeek import·배선')
must(/'peek'/.test(read('src/lib/command-registry.ts') ?? ''), 'command-registry goal 서브커맨드에 peek')
must(/peekTitle/.test(read('src/i18n/ko.ts') ?? ''), 'ko.ts peekTitle 메시지')
must(existsSync('tests/goal-peek.test.ts'), '회귀 테스트 tests/goal-peek.test.ts')
must(/goal peek/.test(read('COMMANDS.md') ?? ''), 'COMMANDS.md 문서화')

if (pass) { console.log('✅ goal 78 gate passes'); process.exit(0) }
console.log('❌ goal 78 gate failed'); process.exit(1)
