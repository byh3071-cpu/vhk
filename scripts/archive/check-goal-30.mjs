#!/usr/bin/env node
// scripts/check-goal-30.mjs — 자동 생성 (vhk goal sync).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 30 gate.')
  process.exit(1)
}

// BOM-safe 읽기: PowerShell Set-Content -Encoding utf8 의 UTF-8 BOM 제거(없으면 throw).
const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 30] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 30 고유 검증 (vhk worktree 가드) ───────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
// 산출물 모듈
for (const f of ['types', 'configList', 'check', 'copy', 'add']) {
  must(existsSync(`src/worktree/${f}.ts`), `src/worktree/${f}.ts 존재`)
}
must(existsSync('src/commands/worktree.ts'), 'src/commands/worktree.ts (CLI) 존재')
must(existsSync('tests/worktree/copy.test.ts'), 'tests/worktree/ 단위테스트 존재')
// 재사용: check.ts 는 Goal 29 worktree-env 모듈을 import(이중 구현 금지)
must(/worktree-env/.test(read('src/worktree/check.ts') ?? ''), 'check.ts 가 worktree-env 모듈 재사용')
// 불변규칙: 심볼릭 링크 금지 — copy 는 copyFile 만, symlink 호출 없음
const copy = read('src/worktree/copy.ts') ?? ''
must(/copyFile/.test(copy), 'copy.ts 가 파일 복사(copyFile) 사용')
must(!/symlink/i.test(copy), 'copy.ts 에 symlink 사용 없음(파일 복사만)')
// 불변규칙: 외부 명령은 safeExecFile — add 코어에 execSync 직접 사용 없음
must(!/execSync/.test(read('src/worktree/add.ts') ?? ''), 'add.ts 에 execSync 없음')
// 불변규칙: git 훅 자동 설치 금지 — .git/hooks 미접근
for (const f of ['add', 'copy', 'configList']) {
  must(!/\.git[\\/]hooks|hooksPath/.test(read(`src/worktree/${f}.ts`) ?? ''), `${f}.ts 가 .git/hooks 미접근`)
}
// raw JSON.parse 금지 → readJsonFile
must(!/JSON\.parse/.test(read('src/worktree/configList.ts') ?? ''), 'configList.ts 가 raw JSON.parse 미사용')
// CLI 단일소스 등록
must(/worktree/.test(read('src/index.ts') ?? ''), 'index.ts 에 worktree 등록')
must(/worktree:/.test(read('src/lib/command-registry.ts') ?? ''), 'command-registry 등록')
must(/worktree/.test(read('src/lib/cli-args.ts') ?? ''), 'cli-args KNOWN_COMMAND_TOKENS 등록')

if (pass) { console.log('✅ goal 30 gate passes'); process.exit(0) }
console.log('❌ goal 30 gate failed'); process.exit(1)
