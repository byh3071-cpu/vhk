#!/usr/bin/env node
// scripts/check-goal-46.mjs — 자동 생성(vhk goal sync) 후 goal 고유 검증 손추가.
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 46 gate.')
  process.exit(1)
}

const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 46] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 46 고유 검증 (git-access 단일 통로화) ─────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
const gitRepo = read('src/lib/git-repo.ts') ?? ''
must(/import \{ safeExecFile \} from '\.\/exec\.js'/.test(gitRepo), 'git-repo.ts 가 safeExecFile import')
must(!/execFileSync\(/.test(gitRepo), 'git-repo.ts 직접 execFileSync 호출 제거(단일 통로)')
must(!/from 'node:child_process'/.test(gitRepo), 'git-repo.ts child_process import 제거')
must(/safeExecFile\('git'/.test(gitRepo), "git-repo.ts 가 safeExecFile('git') 통로 사용")
must(/trimOutput:\s*false|trimOutput\)/.test(gitRepo) || /gitExec\(args, cwd, false\)/.test(gitRepo), 'gitOut 은 raw 보존(trimOutput false)')
must(/export function isGitRepo/.test(gitRepo), 'git-repo.ts isGitRepo(sync) SoT export')
must(/export function hasCommits/.test(gitRepo), 'git-repo.ts hasCommits(sync) SoT export')
// exec.ts 가산적 확장(cwd/trimOutput/stderr)
const exec = read('src/lib/exec.ts') ?? ''
must(/cwd\?:\s*string/.test(exec), 'exec.ts SafeExecOptions 에 cwd')
must(/trimOutput\?:\s*boolean/.test(exec), 'exec.ts SafeExecOptions 에 trimOutput')
must(/stderr\?:\s*string/.test(exec), 'exec.ts ExecResult 실패에 stderr')
// git.ts 위임(중복 제거)
const git = read('src/lib/git.ts') ?? ''
must(/from '\.\/git-repo\.js'/.test(git), 'git.ts 가 git-repo 로 위임 import')
must(/isGitRepoSync\(\)/.test(git) && /hasCommitsSync\(\)/.test(git), 'git.ts isGitRepo/hasAnyCommits 가 git-repo 위임')
// 회귀 테스트
must(existsSync('tests/git-repo.test.ts'), 'tests/git-repo.test.ts 존재')

if (pass) { console.log('✅ goal 46 gate passes'); process.exit(0) }
console.log('❌ goal 46 gate failed'); process.exit(1)
