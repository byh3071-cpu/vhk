#!/usr/bin/env node
// scripts/check-goal-19.mjs — Goal 19: pattern detection v0
// 기본 게이트 = typecheck + test + build. goal 19 고유 검증 포함.
//
// Env: VHK_GATES_SKIP_DEEP=1 → test + build 스킵 (빠른 typecheck-only 패스)

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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 19 gate.')
  process.exit(1)
}

const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
const pkg = existsSync('package.json') ? JSON.parse(readFileSync('package.json', 'utf-8').replace(/^﻿/, '')) : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 19] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
const must = (cond, label) => { console.log((cond ? '    ✓ ' : '    ✗ ') + label); if (!cond) pass = false }

// 공통 게이트
if (scripts.typecheck) gate('typecheck', run(pm, ['run', 'typecheck']))
else if (existsSync('tsconfig.json')) gate('tsc --noEmit', run(pm, pm === 'npm' ? ['exec', '--', 'tsc', '--noEmit'] : ['exec', 'tsc', '--noEmit']))
if (!skipDeep) {
  if (scripts['test:run']) gate('test', run(pm, ['run', 'test:run']))
  else if (scripts.test) gate('test', run(pm, ['run', 'test', '--', '--run']))
  if (scripts.build) gate('build', run(pm, ['run', 'build']))
}

// ─── goal 19 고유 검증 (pattern detection v0) ──────────────────────────────
const pt = read('src/commands/pattern.ts') ?? ''
must(/export function detectCandidates/.test(pt), 'detectCandidates 순수 함수 export')
must(/export const MIN_TAG_FREQ/.test(pt) && /export const MIN_KEYWORD_FREQ/.test(pt), '명명 상수 MIN_TAG_FREQ / MIN_KEYWORD_FREQ (매직넘버 금지)')
must(/export function tokenize/.test(pt), 'tokenize export')
must(/export async function patternDetect/.test(pt) && /export async function patternList/.test(pt) && /export async function patternDismiss/.test(pt), 'patternDetect / patternList / patternDismiss export')
must(/printNextStep/.test(pt), 'printNextStep() 패턴 사용')
must(!/process\.exit\s*\(/.test(pt), 'process.exit() 금지 (MCP 핸들러 정책)')
must(!/execSync/.test(pt), 'execSync 금지 — safeExecFile 사용')
must(/PatternEntryV19/.test(pt), 'PatternEntryV19 구체 스키마 정의')
must(/avoid/.test(pt) && /reinforce/.test(pt), 'avoid / reinforce kind')
must(/axis.*tag.*keyword|tag.*axis|keyword.*axis/.test(pt), 'axis tag/keyword 2축')
must(/_sig/.test(pt), '멱등 병합 시그니처 _sig')
must(/status.*archived|archived.*status/.test(pt), 'dismiss = archived (하드 삭제 금지)')

// NLP 라우터에 pattern 추가됐는지
const nr = read('src/lib/nlp-router.ts') ?? ''
must(/'pattern'/.test(nr), "NlpCommand 에 'pattern' 추가")
must(/패턴|반복|되풀이|pattern/.test(nr), 'NLP 키워드 pattern 등록')

// command-registry 등록
const cr = read('src/lib/command-registry.ts') ?? ''
must(/pattern.*detect.*list.*dismiss|detect.*list.*dismiss/.test(cr), 'command-registry 에 pattern 서브커맨드 등록')

// MCP 등록
const srv = read('src/mcp/server.ts') ?? ''
must(/pattern-detect/.test(srv) && /pattern-list/.test(srv), 'MCP pattern-detect + pattern-list 등록')
must(!/process\.exit/.test(srv.slice(srv.indexOf('pattern-detect'))), 'MCP 핸들러 process.exit() 금지 (runVhkCli 위임)')

// 테스트 존재
must(existsSync('tests/pattern.test.ts'), 'tests/pattern.test.ts 존재')

// 반영 0 — RULES.md 미변경 (패턴 읽기·제안만, 반영 = Goal 20)
const rules = read('RULES.md') ?? ''
must(!/patternDetect|패턴.*반영|pattern.*apply/.test(rules), 'RULES.md 에 패턴 반영 코드 없음 (Goal 20 영역)')

if (pass) { console.log('✅ goal 19 gate passes'); process.exit(0) }
console.log('❌ goal 19 gate failed'); process.exit(1)
