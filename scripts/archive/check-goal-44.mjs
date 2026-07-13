#!/usr/bin/env node
// scripts/check-goal-44.mjs — 자동 생성(vhk goal sync) 후 goal 고유 검증 손추가.
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 44 gate.')
  process.exit(1)
}

const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 44] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 44 고유 검증 (증거↔커밋 SHA 바인딩) ───────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
// git-access 통로(기존 gitOut 재사용, 새 execSync 0)
const gitRepo = read('src/lib/git-repo.ts') ?? ''
must(/export function getCommitInfo/.test(gitRepo), 'git-repo.ts getCommitInfo export')
must(/export interface CommitInfo/.test(gitRepo), 'git-repo.ts CommitInfo 타입')
must(/gitOut\(\['rev-parse', 'HEAD'\]/.test(gitRepo), 'getCommitInfo 가 기존 gitOut 통로 사용(rev-parse HEAD)')
must(/--porcelain/.test(gitRepo), 'dirty 판정에 git status --porcelain 사용')
// verify 증거에 commit 기록
const verify = read('src/commands/verify.ts') ?? ''
must(/commit\??:\s*CommitInfo/.test(verify), 'VerifyReport 에 commit: CommitInfo 필드')
must(/REPORT_SCHEMA_VERSION = 2/.test(verify), 'schema v2 로 bump')
must(/getCommitInfo\(cwd\)/.test(verify), 'verifyEvidence 가 getCommitInfo 로 SHA 수집')
must(/export function checkEvidenceFreshness/.test(verify), 'checkEvidenceFreshness 신선도 검사 export')
must(/현재 HEAD/.test(verify), 'freshness 가 SHA≠HEAD 사유 보고')
// 새 execSync 도입 금지 — verify 는 getCommitInfo 통로만 쓰고 직접 git execSync 안 함
must(!/execFileSync\(\s*'git'/.test(verify) && !/execSync/.test(verify), 'verify.ts 에 새 git execSync 없음(통로 재사용)')
// CLI 노출
must(/--check-fresh/.test(read('src/index.ts') ?? ''), "index.ts 에 verify --check-fresh 옵션")
// HTML 리포트 동기화
must(/report\.commit/.test(read('src/commands/verify-report.ts') ?? ''), 'verify-report.ts footer 가 commit 표시')
// 회귀 테스트
must(existsSync('tests/verify-sha.test.ts'), 'tests/verify-sha.test.ts 존재')

if (pass) { console.log('✅ goal 44 gate passes'); process.exit(0) }
console.log('❌ goal 44 gate failed'); process.exit(1)
