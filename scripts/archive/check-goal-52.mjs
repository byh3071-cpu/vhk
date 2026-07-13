#!/usr/bin/env node
// scripts/check-goal-52.mjs — 자동 생성 (vhk goal sync).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 52 gate.')
  process.exit(1)
}

// BOM-safe 읽기: PowerShell Set-Content -Encoding utf8 의 UTF-8 BOM 제거(없으면 throw).
const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 52] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 52 고유 검증 (직접 추가) ───────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null

// 1) Notion 실 API 경로 — vi.mock 3케이스(auth throw·페이지네이션·retrieve 실패).
const notionT = read('tests/notion.test.ts') ?? ''
must(/vi\.mock\(['"]@notionhq\/client['"]/.test(notionT), 'notion.test 에 @notionhq/client vi.mock')
must(/importNotionPrd/.test(notionT), 'notion.test 가 importNotionPrd(실 API 경로) 검증')
must(/NOTION_TOKEN/.test(notionT), 'auth 누락(NOTION_TOKEN) throw 케이스')
must(/has_more|페이지네이션|mockResolvedValueOnce/.test(notionT), 'fetchAllBlocks 페이지네이션 케이스')
must(/mockRejectedValue|reject/.test(notionT), 'pages.retrieve reject 전파 케이스')

// 2) restore 커맨드 셸 — 정상복원 + 미존재 id(exitCode=1).
const restoreT = read('tests/restore.test.ts') ?? ''
must(restoreT.length > 0, 'tests/restore.test.ts 존재')
must(/from '\.\.\/src\/commands\/restore\.js'/.test(restoreT) || /commands\/restore/.test(restoreT), 'restore 커맨드 셸 import')
must(/exitCode/.test(restoreT), '미존재 id → process.exitCode 검증')

// 3) 구현부 무수정(테스트 전용 goal) — notion-import/restore 핵심 export 시그니처 spot check.
must(/export async function importNotionPrd/.test(read('src/lib/notion-import.ts') ?? ''), 'importNotionPrd export 유지')
must(/export async function restore/.test(read('src/commands/restore.ts') ?? ''), 'restore export 유지')

// 4) 두 테스트 파일 실제 통과(서브셋 — deep 스킵 모드에서도 회귀 사정거리 확인).
if (!skipDeep) {
  must(run(pm, ['exec', 'vitest', 'run', 'tests/notion.test.ts', 'tests/restore.test.ts']), 'notion/restore 테스트 통과')
}

if (pass) { console.log('✅ goal 52 gate passes'); process.exit(0) }
console.log('❌ goal 52 gate failed'); process.exit(1)
