#!/usr/bin/env node
// scripts/check-goal-20.mjs — Goal 20: vhk evolve (설계 등록 단계)
// 현재는 문서 등록 + 기본 게이트만. 구현 단계에서 고유 검증 추가.
//
// Env: VHK_GATES_SKIP_DEEP=1 → test + build 스킵

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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 20 gate.')
  process.exit(1)
}

// Fix #6+잔존#3: BOM-safe 읽기 — 모든 readFile에 적용(check-goal-18 동일 패턴)
const stripBomStr = (t) => t.charCodeAt(0) === 0xfeff ? t.slice(1) : t
const read = (p) => existsSync(p) ? stripBomStr(readFileSync(p, 'utf-8')) : null
const readJson = (p) => { const t = stripBomStr(readFileSync(p, 'utf-8')); return JSON.parse(t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 20] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
const must = (cond, label) => { console.log((cond ? '    ✓ ' : '    ✗ ') + label); if (!cond) pass = false }

// 공통 게이트
if (scripts.typecheck) gate('typecheck', run(pm, ['run', 'typecheck']))
else if (existsSync('tsconfig.json')) gate('tsc --noEmit', run(pm, pm === 'npm' ? ['exec', '--', 'tsc', '--noEmit'] : ['exec', 'tsc', '--noEmit']))
if (!skipDeep) {
  if (scripts['test:run']) gate('test', run(pm, ['run', 'test:run']))
  else if (scripts.test) gate('test', run(pm, ['run', 'test', '--', '--run']))
  if (scripts.build) gate('build', run(pm, ['run', 'build']))
}

// ─── goal 20 고유 검증 (구현 단계) ────────────────────────────────────────
const g20 = read('goals/20-evolve.md') ?? ''
must(g20.includes('id: 20'), 'goals/20-evolve.md: id: 20')
// status 유효값 체크 (IN_PROGRESS/DONE 모두 허용)
const VALID_GOAL_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'BLOCKED']
must(VALID_GOAL_STATUSES.some(s => g20.includes('status: ' + s)), 'goals/20-evolve.md: 유효한 status 값')
must(g20.includes('version: v2.2.0'), 'goals/20-evolve.md: version v2.2.0')
must(g20.includes('depends_on'), 'goals/20-evolve.md: depends_on 선언')
must(g20.includes('goal-19-pattern'), 'goals/20-evolve.md: goal-19-pattern 의존')

// 구현 존재 확인
must(existsSync('src/commands/evolve.ts'), 'src/commands/evolve.ts 구현됨')
must(existsSync('tests/evolve.test.ts'), 'tests/evolve.test.ts 존재')

// evolve.ts 내용 검증
const evTxt = read('src/commands/evolve.ts') ?? ''
must(/export async function evolveSuggest/.test(evTxt), 'evolveSuggest export')
must(/export async function evolveList/.test(evTxt), 'evolveList export')
must(/export async function evolveApply/.test(evTxt), 'evolveApply export')
must(/export async function evolveReject/.test(evTxt), 'evolveReject export')
must(/export async function evolveUndo/.test(evTxt), 'evolveUndo export')
must(/ensureInteractive/.test(evTxt), 'ensureInteractive() 가드 사용')
must(!/process\.exit\s*\(/.test(evTxt), 'process.exit() 금지')
must(!/execSync/.test(evTxt), 'execSync 금지')
// C2: evolve.ts 가 AGENTS/CLAUDE 직접 write 안 함
must(!(/AGENTS\.md|CLAUDE\.md/.test(evTxt) && /writeFileSync|appendFileSync/.test(evTxt)),
     'evolve.ts 가 AGENTS/CLAUDE 직접 write 안 함 (C2)')
// 큐 스키마
must(evTxt.includes('QUEUE_PATH_REL') && evTxt.includes('queue.json'), '큐 경로 정의')
must(evTxt.includes('EvolveQueueItem') && evTxt.includes('EvolveQueueFile'), '큐 스키마 타입')
// 핵심 설계 구현
must(/export function generateCandidates/.test(evTxt), '순수 함수 generateCandidates export')
must(evTxt.includes('dedupeKey') && evTxt.includes('rejected'), 'A1/A2 dedupe+억제')
must(/export function checkApplyRef/.test(evTxt), 'A4 댕글링 참조 가드 export')
must(evTxt.includes('hasUnresolved'), 'C1 단일 apply 제약')
must(evTxt.includes('rulesBackupPath') && evTxt.includes('copyFileSync'), 'undo .bak 저장')
must(evTxt.includes("sync({ yes: true })"), 'sync 비대화형 호출')
must(/export function isDuplicateRule/.test(evTxt), 'B3 중복 룰 감지 export')
// MCP
const srv = read('src/mcp/server.ts') ?? ''
must(/evolve-suggest/.test(srv) && /evolve-list/.test(srv), 'MCP evolve-suggest + evolve-list')
// command-registry
const cr = read('src/lib/command-registry.ts') ?? ''
must(/evolve.*suggest.*list.*apply.*reject.*undo/.test(cr.replace(/\s+/g, '')), 'command-registry evolve 서브커맨드')
// Goal 19 의존성
must(existsSync('goals/19-pattern.md'), 'goals/19-pattern.md 존재')
must(existsSync('src/commands/pattern.ts'), 'src/commands/pattern.ts 존재')
// 18 금지문구 없음
const FORBIDDEN = /SoT 분리|이중\s?기록|별도 SoT|learnings\.md append|memory\.json\s?과\s?별도/
must(!FORBIDDEN.test(evTxt), 'evolve.ts 18 금지문구 없음')

if (pass) { console.log('✅ goal 20 gate passes'); process.exit(0) }
console.log('❌ goal 20 gate failed'); process.exit(1)
