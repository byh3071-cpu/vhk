#!/usr/bin/env node
// scripts/check-goal-48.mjs — 자동 생성 (vhk goal sync).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 48 gate.')
  process.exit(1)
}

// BOM-safe 읽기: PowerShell Set-Content -Encoding utf8 의 UTF-8 BOM 제거(없으면 throw).
const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 48] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 48 고유 검증 (MCP↔CLI 단일 진실원) ───────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null

// 1) git-session 공유 SoT 존재 + 세션 git 질문 함수 export.
const session = read('src/lib/git-session.ts') ?? ''
must(session.length > 0, 'src/lib/git-session.ts 존재')
must(/import \{ safeExecFile/.test(session), 'git-session 이 safeExecFile(Goal 46 단일 통로) 위에 구축')
for (const fn of ['statusPorcelain', 'stageAll', 'commit', 'push', 'softReset', 'recentCommits', 'unstagedStat', 'numstatHead', 'okOut']) {
  must(new RegExp('export function ' + fn + '\\b').test(session), `git-session export: ${fn}`)
}
// porcelain 은 raw 보존(선행 공백 load-bearing) — trim 하면 status 오집계.
must(/trimOutput:\s*false/.test(session), 'statusPorcelain raw 보존(trimOutput:false)')

// 2) MCP 가 git 을 인라인 재구현하지 않는다 — server.ts 에 직접 git 호출 0건.
const server = read('src/mcp/server.ts') ?? ''
must(!/safeExecFile\((['"])git\1/.test(server), "server.ts 인라인 git 호출 제거(safeExecFile('git') 0건)")
must(!/function isGitRepo\s*\(/.test(server), 'server.ts 로컬 isGitRepo 재정의 제거')
must(/import \{ isGitRepo \} from '\.\.\/lib\/git-repo\.js'/.test(server), 'server.ts isGitRepo 를 git-repo SoT(Goal 46) 에서 import')
must(/from '\.\.\/lib\/git-session\.js'/.test(server), 'server.ts 가 git-session 공유 함수 사용')

// 3) CLI 세션 명령(save/undo/status/diff)도 동일 git-session 함수를 공유(같은 질문=함수 하나).
for (const cmd of ['save', 'undo', 'status', 'diff']) {
  const src = read(`src/commands/${cmd}.ts`) ?? ''
  must(/from '\.\.\/lib\/git-session\.js'/.test(src), `${cmd}.ts 가 git-session 공유 SoT 사용`)
}

// 4) 회귀 봉쇄 — git-session 행동 테스트 + MCP↔CLI 계약(#150/#152/#161 앵커).
must(existsSync('tests/git-session.test.ts'), 'tests/git-session.test.ts 존재(행동 봉쇄)')
must(existsSync('tests/mcp-cli-contract.test.ts'), 'tests/mcp-cli-contract.test.ts 존재(#150/#152/#161 앵커)')

if (pass) { console.log('✅ goal 48 gate passes'); process.exit(0) }
console.log('❌ goal 48 gate failed'); process.exit(1)
