#!/usr/bin/env node
// scripts/check-goal-21.mjs — 자동 생성(vhk goal sync) 후 goal 고유 검증 손추가.
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 21 gate.')
  process.exit(1)
}

const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 21] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 21 고유 검증 (vhk seo init — 스캐폴드 + 사이트등록 + 키보관) ───────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null

// 1) commands/seo 골격 + lib
must(existsSync('src/commands/seo/index.ts'), 'src/commands/seo/index.ts 존재')
must(existsSync('src/commands/seo/init.ts'), 'src/commands/seo/init.ts 존재')
const seoLib = read('src/lib/seo-config.ts') ?? ''
must(seoLib !== '', 'src/lib/seo-config.ts 존재')

// 2) 등록 3곳 — 누락 시 NLP 라우터가 가로챔(R1)
const registry = read('src/lib/command-registry.ts') ?? ''
must(/seo:\s*\['init'\]/.test(registry), "command-registry CONTAINER_SUBCOMMANDS 에 seo: ['init']")
must(/name:\s*'seo'/.test(registry), 'command-registry TOP_LEVEL_COMMANDS 에 seo')
const cliArgs = read('src/lib/cli-args.ts') ?? ''
must(/'seo'/.test(cliArgs), 'cli-args KNOWN_COMMAND_TOKENS 에 seo')
const indexTs = read('src/index.ts') ?? ''
must(/\.command\('seo'\)/.test(indexTs), "index.ts commander 에 .command('seo')")
must(/\.command\('init'\)/.test(indexTs) && /seoInit/.test(indexTs), 'index.ts seo init 서브커맨드 + seoInit 액션')

// 3) i18n + 테스트
const ko = read('src/i18n/ko.ts') ?? ''
must(/secretGuideHeader/.test(ko), 'i18n ko.seo.init 블록 존재')
must(existsSync('tests/seo-init.test.ts'), 'tests/seo-init.test.ts 존재')

// 4) 보안 불변 — config 에 들어가는 secret 은 환경변수 참조($이름)만, 평문 값 0
must(/DEFAULT_SECRET_REFS/.test(seoLib), 'seo-config DEFAULT_SECRET_REFS 정의')
const refsBlock = (seoLib.match(/DEFAULT_SECRET_REFS[^=]*=\s*\{([\s\S]*?)\}/) ?? [])[1] ?? ''
const refValues = [...refsBlock.matchAll(/:\s*'([^']*)'/g)].map(m => m[1])
must(refValues.length === 5 && refValues.every(v => v.startsWith('$')), '5개 secret 전부 $ 참조(평문 값 아님)')
must(/isSecretReference/.test(seoLib), 'isSecretReference 가드(평문 유입 차단) 존재')
// init 이 secret '값'을 config 에 쓰지 않음 — 참조만 보관(resolveSecretPresence 는 boolean)
const initTs = read('src/commands/seo/init.ts') ?? ''
must(/resolveSecretPresence/.test(initTs), 'init 은 resolveSecretPresence(boolean) 사용 — 값 미출력')

if (pass) { console.log('✅ goal 21 gate passes'); process.exit(0) }
console.log('❌ goal 21 gate failed'); process.exit(1)
