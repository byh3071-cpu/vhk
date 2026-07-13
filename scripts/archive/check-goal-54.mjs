#!/usr/bin/env node
// scripts/check-goal-54.mjs — 자동 생성 (vhk goal sync).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 54 gate.')
  process.exit(1)
}

// BOM-safe 읽기: PowerShell Set-Content -Encoding utf8 의 UTF-8 BOM 제거(없으면 throw).
const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 54] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 54 고유 검증 (README 버전 = package.json SoT 동적 비교) ─────────────
// ⚠️ 버전 하드코딩 금지 — origin/main 이동으로 버전 변할 수 있으니 pkg.version 과 동적 비교.
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
const stripBom = (t) => (t && t.charCodeAt(0) === 0xfeff ? t.slice(1) : t)
const expected = pkg.version
const readme = stripBom(read('README.md') ?? '')
const head = readme.split('\n').slice(0, 16).join('\n') // frontmatter + 제목 blockquote 범위

const tagM = head.match(/tags:.*?v(\d+\.\d+\.\d+)/)
must(!!tagM, 'README frontmatter tags 에 vX.Y.Z 존재')
must(tagM && tagM[1] === expected, `README tags 버전(${tagM ? tagM[1] : '없음'}) = package.json(${expected})`)

const bqM = head.match(/\*\*v(\d+\.\d+\.\d+)\*\*/)
must(!!bqM, 'README 상단 blockquote 에 **vX.Y.Z** 존재')
must(bqM && bqM[1] === expected, `README blockquote 버전(${bqM ? bqM[1] : '없음'}) = package.json(${expected})`)

// 가드(version-sync.test.ts)가 README 까지 검사하도록 확장됐는지.
const vsT = read('tests/version-sync.test.ts') ?? ''
must(/README\.md/.test(vsT), 'version-sync.test 가 README 검사로 확장됨')
must(/frontmatter/.test(vsT) && /blockquote/.test(vsT), 'version-sync 가 frontmatter+blockquote 두 곳 검사')

if (pass) { console.log('✅ goal 54 gate passes'); process.exit(0) }
console.log('❌ goal 54 gate failed'); process.exit(1)
