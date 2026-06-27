#!/usr/bin/env node
// scripts/check-goal-87.mjs — 자동 생성 (vhk goal sync).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 87 gate.')
  process.exit(1)
}

// BOM-safe 읽기: PowerShell Set-Content -Encoding utf8 의 UTF-8 BOM 제거(없으면 throw).
const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 87] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 87 고유 검증 (의도 대조 — mission ↔ receipt/review 잇기) ───────────────────────────────
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null

// ① 순수 핵심(receipt.ts) — ⑤ intent 증거 타입 + decision 결정론 반영(단조성 불변)
const core = read('src/lib/receipt.ts') ?? ''
must(/export interface ReceiptIntentEvidence/.test(core), 'receipt.ts: ReceiptIntentEvidence(⑤ 의도 증거 타입)')
must(/intent\?:\s*ReceiptIntentEvidence/.test(core), 'receipt.ts: ReceiptEvidence.intent? 옵셔널 필드(하위호환 — staleKnown 동형)')
must(/forbiddenViolated/.test(core) && /return 'block'/.test(core), 'receipt.ts: decideReceipt forbidden 위반 → block(red/dirty/stale 동급 실차단)')
must(/scopeWarned/.test(core) && /return 'caution'/.test(core), 'receipt.ts: decideReceipt scope 밖 → caution(advisory, block 아님)')
must(/missionKnown/.test(core), 'receipt.ts: missionKnown=false 면 영향 0(mission 부재 하위호환)')

// ② 경계(commands/receipt.ts) — mission.json 있으면 checkMission 글루(기존 자산 재사용)
const cmd = read('src/commands/receipt.ts') ?? ''
must(/readMission/.test(cmd) && /checkMission/.test(cmd), 'commands/receipt.ts: readMission+checkMission 재사용(의도 수집 글루)')
must(/forbiddenHits:\s*result\.violations\.length/.test(cmd), 'commands/receipt.ts: forbiddenHits=violations(결정론 차단 배선)')
must(/scopeWarnings:\s*result\.warnings\.length/.test(cmd), 'commands/receipt.ts: scopeWarnings=warnings(advisory 배선)')

// ③ 산출 .md ⑤ intent 행 + mission checksum(사후 위조 탐지) = PR3(receipt .md 의도 대조 섹션)
must(/⑤ intent\(의도 대조\)/.test(core), 'receipt.ts: renderReceiptMarkdown ⑤ intent(의도 대조) 행 — PR3')
must(/mission checksum/.test(core), 'receipt.ts: mission checksum 1줄(발행시점 계약 해시 — 사후 위조 탐지)')

// ④ review(PR2) — forbidden 위반을 거짓완료 신호(suspicion)로, scope 밖은 gap(advisory)로 합류
const review = read('src/commands/review.ts') ?? ''
must(/readMission/.test(review) && /checkMission/.test(review) && /collectChangedFiles/.test(review), 'review.ts: 의도 대조 합류(readMission/checkMission/collectChangedFiles)')
must(/mission\.violations/.test(review) && /suspicions\.push/.test(review), 'review.ts: forbidden 위반 → suspicion(거짓완료 강한 의심)')
must(/mission\.warnings/.test(review) && /gaps\.push/.test(review), 'review.ts: scope 밖 변경 → gap(advisory)')

// ⑤ 불변식·합류 회귀 테스트 존재(단조성·과확장 0·하위호환)
const tReceipt = read('tests/receipt.test.ts') ?? ''
must(/⑤ intent\(의도 대조\) 반영/.test(tReceipt), 'tests/receipt.test.ts: intent decision 반영(forbidden→block·scope→caution) 테스트')
must(/과확장 0/.test(tReceipt), 'tests/receipt.test.ts: 과확장 0(위반·경고 0 이면 caution 유발 안 함) 테스트')
must(/의도 대조 \(Goal 87 PR2\)/.test(read('tests/review.test.ts') ?? ''), 'tests/review.test.ts: review 의도 대조(PR2) 합류 테스트')

if (pass) { console.log('✅ goal 87 gate passes'); process.exit(0) }
console.log('❌ goal 87 gate failed'); process.exit(1)
