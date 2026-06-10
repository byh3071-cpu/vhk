#!/usr/bin/env node
// scripts/check-goal-24.mjs — vhk seo check (수익·빙) 게이트.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const SHIM = new Set(['pnpm', 'npm', 'npx', 'yarn'])
function run(cmd, args) {
  let bin = cmd, argv = args
  if (process.platform === 'win32' && SHIM.has(cmd)) { bin = 'cmd.exe'; argv = ['/d', '/s', '/c', cmd + '.cmd', ...args] }
  try { execFileSync(bin, argv, { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 }); return true }
  catch (e) { const out = (e?.stdout?.toString() ?? '') + (e?.stderr?.toString() ?? ''); if (out.trim()) console.log(out.split('\n').slice(-25).join('\n')); return false }
}
if (existsSync('.vhk/HARD_STOP')) { console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 24 gate.'); process.exit(1) }
const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 24] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 24 고유 검증 (seo check — 수익·빙 + AdSense v1.4 금지) ───────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
const check = read('src/commands/seo/check.ts') ?? ''
const types = read('src/commands/seo/types.ts') ?? ''
must(check.length > 0, 'src/commands/seo/check.ts 존재')
must(/ADSENSE_V14_FORBIDDEN/.test(check), 'AdSense v1.4 금지 가드(상수)')
must(!/adsense\/v1\.4|adsense.*v1_4/.test(check), 'AdSense v1.4 엔드포인트 미사용')
must(/SeoRevenueBlock/.test(types) && /SeoBingBlock/.test(types), 'latest.json revenue/bing 섹션 스키마')
must(/aiCitationsDeepLink/.test(types), '빙 AI Performance 딥링크 폴백(베스트에포트)')
const idx = read('src/index.ts') ?? ''
must(/\.command\('check'\)/.test(idx), "index.ts seo check 등록(23·24 공유)")
must(existsSync('tests/seo-check.test.ts'), 'seo-check 테스트 존재')
if (!skipDeep) must(run(pm, ['exec', 'vitest', 'run', 'tests/seo-check.test.ts']), 'seo-check 테스트 통과')

if (pass) { console.log('✅ goal 24 gate passes'); process.exit(0) }
console.log('❌ goal 24 gate failed'); process.exit(1)
