#!/usr/bin/env node
// scripts/check-goal-99.mjs — 자동 생성 (vhk goal sync).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 99 gate.')
  process.exit(1)
}

// BOM-safe 읽기: PowerShell Set-Content -Encoding utf8 의 UTF-8 BOM 제거(없으면 throw).
const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 99] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 99 고유 검증 (직접 추가) ───────────────────────────────
// 이슈 #373: 자율성완주율 측정 스키마. vhk autonomy-log 가 등록 4지점 + 방어 패턴
// (run-id 없이 종결 이벤트 기록 금지) + SKILL.md INV-9 훅 삽입까지 갖췄는지 문자열로 확인.
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null

// 1) autonomy-log.ts — 토대. 4이벤트 타입 + writer/reader + runId 발급기.
const autonomyLogTs = read('src/lib/autonomy-log.ts')
must(autonomyLogTs?.includes("export type AutonomyEvent = 'start' | 'complete' | 'hardstop' | 'blocked'"), 'autonomy-log.ts 가 AutonomyEvent(4이벤트) export')
must(autonomyLogTs?.includes('export function appendAutonomyEntry'), 'autonomy-log.ts 가 appendAutonomyEntry() export')
must(autonomyLogTs?.includes('export function readAutonomyLog'), 'autonomy-log.ts 가 readAutonomyLog() export')
must(autonomyLogTs?.includes('export function newAutonomyRunId'), 'autonomy-log.ts 가 newAutonomyRunId() export')
must(/randomUUID/.test(autonomyLogTs ?? ''), 'newAutonomyRunId 가 crypto.randomUUID 사용')
must(
  autonomyLogTs?.replace(/\\/g, '/').includes("join('.vhk', 'events', 'autonomy-run.jsonl')"),
  "AUTONOMY_LOG_PATH_REL 이 .vhk/events/autonomy-run.jsonl 경로"
)

// 2) agent.ts — autonomyLog() CLI 레이어. run-id 없이 종결 이벤트 기록 거부(방어 패턴).
const agentTs = read('src/commands/agent.ts')
must(agentTs?.includes('export async function autonomyLog'), 'agent.ts 가 autonomyLog() export')
must(agentTs?.includes('newAutonomyRunId()'), 'autonomyLog 의 start 분기가 newAutonomyRunId() 로 runId 발급')
must(
  /if \(!opts\.runId[\s\S]{0,400}process\.exitCode = 1/.test(agentTs ?? ''),
  'autonomyLog 가 --run-id 없이 종결 이벤트 호출 시 exitCode=1 로 거부(blocker() 방어 패턴 동일 계약)'
)

// 3) index.ts — 커맨드 등록 + --event allowlist 코드 검증(닫힌집합 값 프롬프트만 믿지 않기).
const indexTs = read('src/index.ts')
must(indexTs?.includes("command('autonomy-log')"), "index.ts 가 'autonomy-log' 커맨드 등록")
must(indexTs?.includes("alias('자율기록')"), "index.ts 가 '자율기록' 한글 별칭 등록")
must(
  /KNOWN_EVENTS = new Set\(\['start', 'complete', 'hardstop', 'blocked'\]\)/.test(indexTs ?? ''),
  'index.ts 가 --event 값을 allowlist(Set)로 코드 검증(LLM/사용자 입력 프롬프트 제약만 믿지 않음)'
)

// 4) command-registry.ts / cli-args.ts — 등록 4지점 체크리스트(영문+한글 별칭).
const registryTs = read('src/lib/command-registry.ts')
must(/name:\s*'autonomy-log'/.test(registryTs ?? ''), 'command-registry.ts TOP_LEVEL_COMMANDS 에 autonomy-log 등재')

const cliArgsTs = read('src/lib/cli-args.ts')
must(cliArgsTs?.includes("'autonomy-log'"), "cli-args.ts KNOWN_COMMAND_TOKENS 에 'autonomy-log' 등재")
must(cliArgsTs?.includes("'자율기록'"), "cli-args.ts KNOWN_COMMAND_TOKENS 에 '자율기록' 한글 별칭 등재")

// 5) ko.ts — agent.autonomyLogTitle.
const koTs = read('src/i18n/ko.ts')
must(koTs?.includes('autonomyLogTitle'), 'ko.ts agent 블록에 autonomyLogTitle 존재')

// 6) COMMANDS.md — 카탈로그 표 정합(commands-doc.test.ts 와 동일 취지 이중 확인).
const commandsMd = read('COMMANDS.md')
must(commandsMd?.includes('vhk autonomy-log'), 'COMMANDS.md 카탈로그 표에 vhk autonomy-log 행 존재')

// 7) SKILL.md — INV-9 + 루프 훅 삽입.
const skillMd = read('.claude/skills/vhk-auto/SKILL.md')
must(skillMd?.includes('INV-9'), 'vhk-auto/SKILL.md 에 INV-9 신설')
must(/autonomy-log/.test(skillMd ?? ''), 'vhk-auto/SKILL.md 가 autonomy-log 커맨드를 루프에 배선')

// 8) 테스트 파일 존재 + 4이벤트 커버.
const autonomyLogTest = read('tests/autonomy-log.test.ts')
must(existsSync('tests/autonomy-log.test.ts'), 'tests/autonomy-log.test.ts 신규 존재')
must(
  ['start', 'complete', 'hardstop', 'blocked'].every((ev) => (autonomyLogTest ?? '').includes(`'${ev}'`)),
  'tests/autonomy-log.test.ts 가 4이벤트(start/complete/hardstop/blocked) 전부 커버'
)

if (pass) { console.log('✅ goal 99 gate passes'); process.exit(0) }
console.log('❌ goal 99 gate failed'); process.exit(1)
