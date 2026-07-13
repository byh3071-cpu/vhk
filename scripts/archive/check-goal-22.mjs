#!/usr/bin/env node
// scripts/check-goal-22.mjs — vhk seo submit (사이트맵 + IndexNow) 게이트.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const SHIM = new Set(['pnpm', 'npm', 'npx', 'yarn'])
function run(cmd, args) {
  let bin = cmd, argv = args
  if (process.platform === 'win32' && SHIM.has(cmd)) { bin = 'cmd.exe'; argv = ['/d', '/s', '/c', cmd + '.cmd', ...args] }
  try { execFileSync(bin, argv, { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 }); return true }
  catch (e) { const out = (e?.stdout?.toString() ?? '') + (e?.stderr?.toString() ?? ''); if (out.trim()) console.log(out.split('\n').slice(-25).join('\n')); return false }
}
if (existsSync('.vhk/HARD_STOP')) { console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 22 gate.'); process.exit(1) }
const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 22] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 22 고유 검증 (seo submit) ──────────────────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
const submit = read('src/commands/seo/submit.ts') ?? ''
must(submit.length > 0, 'src/commands/seo/submit.ts 존재')
must(/export function generateIndexNowKey/.test(submit) && /export function buildIndexNowPayload/.test(submit), 'IndexNow 순수 로직 export(키 생성·페이로드)')
must(/export async function seoSubmit/.test(submit), 'seoSubmit 커맨드 export')
must(/GOOGLE_INDEXING_API_FORBIDDEN/.test(submit), '구글 Indexing API 금지 가드(상수)')
must(!/(fetch|axios|https?\.request)[^\n]*indexing\.googleapis\.com/.test(submit), '구글 Indexing API 미호출')
// 4지점 등록
const idx = read('src/index.ts') ?? ''
const reg = read('src/lib/command-registry.ts') ?? ''
must(/\.command\('submit'\)/.test(idx), "index.ts seo submit 등록")
must(/seo:\s*\[[^\]]*'submit'/.test(reg), 'command-registry seo:submit')
must(existsSync('tests/seo-submit.test.ts'), 'tests/seo-submit.test.ts 존재')
if (!skipDeep) must(run(pm, ['exec', 'vitest', 'run', 'tests/seo-submit.test.ts']), 'seo-submit 테스트 통과')

if (pass) { console.log('✅ goal 22 gate passes'); process.exit(0) }
console.log('❌ goal 22 gate failed'); process.exit(1)
