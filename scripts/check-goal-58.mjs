#!/usr/bin/env node
// scripts/check-goal-58.mjs — evolve 스키마 v2 게이트.
// 기본 게이트 = typecheck + (lint) + test + build. goal 고유 검증은 아래 구역.
//
// Env: VHK_GATES_SKIP_DEEP=1  → test + build 스킵 (빠른 typecheck-only 패스)

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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 58 gate.')
  process.exit(1)
}

const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 58] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 58 고유 검증 (evolve 스키마 v2) ───────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
const evolve = read('src/commands/evolve.ts') ?? ''

// 1) 스키마 v2 승격 + 5계층 targetLayer.
must(/QUEUE_VERSION\s*=\s*2/.test(evolve), 'QUEUE_VERSION = 2')
must(/type TargetLayer\s*=.*'memory'.*'rule'.*'workflow'.*'code'.*'product'/s.test(evolve), 'TargetLayer 5종(memory/rule/workflow/code/product)')
must(/targetLayer\??:\s*TargetLayer/.test(evolve), 'EvolveQueueItem.targetLayer 필드')

// 2) 마이그레이션 + 충돌 검출 export.
must(/export function migrateQueueToV2/.test(evolve), 'migrateQueueToV2 export')
must(/export function findDedupeCollisions/.test(evolve), 'findDedupeCollisions export')

// 3) readQueue v1 자동 변환 + writeQueue 원자 치환·백업.
must(/v\s*<\s*QUEUE_VERSION/.test(evolve) && /migrateQueueToV2\(parsed\)/.test(evolve), 'readQueue 가 v1 상향 자동 변환(미래버전 다운그레이드 금지)')
must(/atomicWriteFile\(/.test(evolve), 'writeQueue 원자 치환(atomicWriteFile)')
must(/\.v1\.bak/.test(evolve) && /\.bak/.test(evolve), 'writeQueue .bak/.v1.bak 백업')

// 4) raw JSON.parse 금지 준수(read-json/atomic-write 패턴).
must(run('node', ['scripts/check-no-raw-json-parse.mjs', 'src']), 'check-no-raw-json-parse 통과')

// 5) 회귀/신규 테스트 통과(마이그레이션·라운드트립·dedupe·복원).
must(existsSync('tests/evolve.test.ts'), 'tests/evolve.test.ts 존재')
if (!skipDeep) {
  must(run(pm, ['exec', 'vitest', 'run', 'tests/evolve.test.ts']), 'evolve 테스트 통과')
}

if (pass) { console.log('✅ goal 58 gate passes'); process.exit(0) }
console.log('❌ goal 58 gate failed'); process.exit(1)
