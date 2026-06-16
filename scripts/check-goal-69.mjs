#!/usr/bin/env node
// scripts/check-goal-69.mjs — 자동 생성 (vhk goal sync).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 69 gate.')
  process.exit(1)
}

// BOM-safe 읽기: PowerShell Set-Content -Encoding utf8 의 UTF-8 BOM 제거(없으면 throw).
const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 69] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 69 고유 검증 ───────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
const ev = read('src/commands/evolve.ts') ?? ''
must(/export function evolveNegatives/.test(ev), 'evolveNegatives export')
must(/export function buildNegativeFromFailure/.test(ev), 'buildNegativeFromFailure 순수함수')
must(/export function renderNegativeCandidates/.test(ev), 'renderNegativeCandidates 순수함수')
must(/export function extractTsTitle/.test(ev), 'extractTsTitle 순수함수')
must(/NEGATIVES_PATH/.test(ev), '.vhk/negative-candidates.md 경로 상수')
must(/readMemory\(cwd\)\.failures/.test(ev), 'memory failures 버킷 수집')
must(/troubleshooting/.test(ev), 'docs/troubleshooting 수집원')
// RULES.md 자동 편집 0 — negatives 핸들러는 후보만 제안(RULES.md write 금지). 카드 Forbidden.
must(!/evolveNegatives[\s\S]*?writeFileSync\([^)]*RULES\.md/.test(ev), 'negatives 가 RULES.md 자동편집 안 함')
// 등록 — index(서브커맨드+한글별칭)·command-registry(컨테이너 서브)·ko.ts·COMMANDS
must(/negatives/.test(read('src/index.ts') ?? '') && /부정예시/.test(read('src/index.ts') ?? ''), 'index.ts 서브커맨드 + 한글별칭')
must(/'negatives'/.test(read('src/lib/command-registry.ts') ?? ''), 'command-registry evolve 서브커맨드 등록')
must(/negativesTitle/.test(read('src/i18n/ko.ts') ?? ''), 'ko.ts negativesTitle 메시지 키')
must(/vhk evolve negatives/.test(read('COMMANDS.md') ?? ''), 'COMMANDS.md 문서화')

if (pass) { console.log('✅ goal 69 gate passes'); process.exit(0) }
console.log('❌ goal 69 gate failed'); process.exit(1)
