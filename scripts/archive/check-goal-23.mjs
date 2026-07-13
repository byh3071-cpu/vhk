#!/usr/bin/env node
// scripts/check-goal-23.mjs — vhk seo check (색인·트래픽) 게이트.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const SHIM = new Set(['pnpm', 'npm', 'npx', 'yarn'])
function run(cmd, args) {
  let bin = cmd, argv = args
  if (process.platform === 'win32' && SHIM.has(cmd)) { bin = 'cmd.exe'; argv = ['/d', '/s', '/c', cmd + '.cmd', ...args] }
  try { execFileSync(bin, argv, { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 }); return true }
  catch (e) { const out = (e?.stdout?.toString() ?? '') + (e?.stderr?.toString() ?? ''); if (out.trim()) console.log(out.split('\n').slice(-25).join('\n')); return false }
}
if (existsSync('.vhk/HARD_STOP')) { console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 23 gate.'); process.exit(1) }
const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 23] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 23 고유 검증 (seo check — 색인·트래픽 + latest.json 스키마) ──────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
const check = read('src/commands/seo/check.ts') ?? ''
const types = read('src/commands/seo/types.ts') ?? ''
must(check.length > 0, 'src/commands/seo/check.ts 존재')
must(/export function canInspect/.test(check) && /URL_INSPECTION_LIMIT/.test(check), 'URL Inspection 한도 가드(2000/일·600/분)')
must(/export async function seoCheck/.test(check), 'seoCheck 커맨드 export')
must(/perDay:\s*2000/.test(check) && /perMin:\s*600/.test(check), 'URL Inspection 한도값 2000/600')
must(/SeoLatest/.test(types) && /export function mergeLatest/.test(types), 'latest.json 스키마 + mergeLatest')
must(/readJsonFile/.test(types), 'latest.json readJsonFile(raw JSON.parse 금지)')
const idx = read('src/index.ts') ?? ''
const reg = read('src/lib/command-registry.ts') ?? ''
must(/\.command\('check'\)/.test(idx), "index.ts seo check 등록")
must(/seo:\s*\[[^\]]*'check'/.test(reg), 'command-registry seo:check')
must(existsSync('tests/seo-check.test.ts') && existsSync('tests/seo-latest.test.ts'), 'seo-check/latest 테스트 존재')
if (!skipDeep) must(run(pm, ['exec', 'vitest', 'run', 'tests/seo-check.test.ts', 'tests/seo-latest.test.ts']), 'seo-check/latest 테스트 통과')

if (pass) { console.log('✅ goal 23 gate passes'); process.exit(0) }
console.log('❌ goal 23 gate failed'); process.exit(1)
