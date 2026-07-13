#!/usr/bin/env node
// scripts/check-goal-25.mjs — vhk seo report (무빌드 HTML) 게이트.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const SHIM = new Set(['pnpm', 'npm', 'npx', 'yarn'])
function run(cmd, args) {
  let bin = cmd, argv = args
  if (process.platform === 'win32' && SHIM.has(cmd)) { bin = 'cmd.exe'; argv = ['/d', '/s', '/c', cmd + '.cmd', ...args] }
  try { execFileSync(bin, argv, { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 }); return true }
  catch (e) { const out = (e?.stdout?.toString() ?? '') + (e?.stderr?.toString() ?? ''); if (out.trim()) console.log(out.split('\n').slice(-25).join('\n')); return false }
}
if (existsSync('.vhk/HARD_STOP')) { console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 25 gate.'); process.exit(1) }
const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 25] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 25 고유 검증 (seo report — 무빌드 HTML 4블록) ────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
const report = read('src/commands/seo/report.ts') ?? ''
must(report.length > 0, 'src/commands/seo/report.ts 존재')
must(/export function renderSeoReportHtml/.test(report), 'renderSeoReportHtml 순수 렌더 export')
must(/export async function seoReport/.test(report), 'seoReport 커맨드 export')
must(/DEEP_LINKS/.test(report) && /warnBadge|⚠️/.test(report), '못하는 항목 ⚠️ 배지 + 딥링크')
must(!/<script[^>]+src=|cdn\.|unpkg|jsdelivr/.test(report), '외부 CDN 의존 0(무빌드·인라인)')
const idx = read('src/index.ts') ?? ''
const reg = read('src/lib/command-registry.ts') ?? ''
must(/\.command\('report'\)/.test(idx), "index.ts seo report 등록")
must(/seo:\s*\[[^\]]*'report'/.test(reg), 'command-registry seo:report')
must(existsSync('tests/seo-report.test.ts'), 'tests/seo-report.test.ts 존재')
if (!skipDeep) must(run(pm, ['exec', 'vitest', 'run', 'tests/seo-report.test.ts']), 'seo-report 테스트 통과')

if (pass) { console.log('✅ goal 25 gate passes'); process.exit(0) }
console.log('❌ goal 25 gate failed'); process.exit(1)
