#!/usr/bin/env node
// scripts/check-goal-98.mjs — 자동 생성 (vhk goal sync).
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
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 98 gate.')
  process.exit(1)
}

// BOM-safe 읽기: PowerShell Set-Content -Encoding utf8 의 UTF-8 BOM 제거(없으면 throw).
const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 98] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
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

// ─── goal 98 고유 검증 (직접 추가) ───────────────────────────────
// 이슈 #375 재시도: recall eval queryType 분해 + diff-cover branch 커버리지 스키마.
const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null

const recallEvalTs = read('src/lib/recall-eval.ts')
must(/queryType\?:\s*'lexical'\s*\|\s*'paraphrase'/.test(recallEvalTs ?? ''), 'recall-eval.ts EvalLabel 에 queryType?: \'lexical\'|\'paraphrase\' 필드')
must(recallEvalTs?.includes('byQueryType'), 'recall-eval.ts EvalResult 에 byQueryType 필드')
must(recallEvalTs?.includes("queryType !== 'lexical' && queryType !== 'paraphrase'"), 'validateEvalLabels 가 queryType 허용값 외 문자열을 거부')
must(recallEvalTs?.includes('buildByQueryType'), 'scoreEval 이 buildByQueryType 헬퍼로 3버킷(lexical/paraphrase/unknown) 분해')

const memoryEvalTs = read('src/commands/memory-eval.ts')
must(memoryEvalTs?.includes('byQueryType'), 'memory-eval.ts memoryEval() 이 byQueryType 을 출력에 반영')

const coverageParseTs = read('src/lib/coverage-parse.ts')
must(coverageParseTs?.includes('branchPartial: Set<number>'), 'coverage-parse.ts FileCoverage 에 branchPartial: Set<number> 필드(required)')
must(coverageParseTs?.includes('branchMap') && coverageParseTs?.includes('cov.b'), 'coverage-parse.ts 가 branchMap/b 를 파싱')
must(
  coverageParseTs?.includes('branch.loc?.start?.line'),
  'coverage-parse.ts 가 location.line 없을 때 branch.loc.start.line 으로 폴백'
)

const diffCoverageTs = read('src/lib/diff-coverage.ts')
must(diffCoverageTs?.includes('uncoveredBranch?: number[]'), 'diff-coverage.ts FileDiffCoverage 에 uncoveredBranch?: number[] 필드')
must(
  /fc\s*\?\s*addedSorted\.filter\(\(ln\)\s*=>\s*fc\.branchPartial\.has\(ln\)\)\s*:\s*\[\]/.test(diffCoverageTs ?? ''),
  'diffCoverage() 가 branchPartial ∩ addedSorted 로 uncoveredBranch 계산(fc 없으면 빈 배열)'
)

const diffCoverTs = read('src/commands/diff-cover.ts')
must(diffCoverTs?.includes('분기 미검증'), 'diff-cover.ts formatReport() 가 "분기 미검증" 라인을 렌더링')
must(diffCoverTs?.includes('anyBranchUncovered'), 'formatReport() 가 branch 미검증 존재 시 축하 메시지로 은폐하지 않음(anyBranchUncovered 가드)')

// 테스트 파일에 신규 케이스가 실재하는지(스텁 아님) 확인 — TDD 산출물 검증.
const recallEvalTest = read('tests/recall-eval.test.ts')
must(recallEvalTest?.includes('#375'), 'tests/recall-eval.test.ts 에 #375 신규 케이스 존재')

const coverageParseTest = read('tests/coverage-parse.test.ts')
must(coverageParseTest?.includes('#375') && coverageParseTest?.includes('branchMap'), 'tests/coverage-parse.test.ts 에 #375 branchMap fixture 케이스 존재')

const diffCoverageTest = read('tests/diff-coverage.test.ts')
must(diffCoverageTest?.includes('uncoveredBranch'), 'tests/diff-coverage.test.ts 에 uncoveredBranch 케이스 존재')

const diffCoverTest = read('tests/diff-cover.test.ts')
must(diffCoverTest?.includes('branchPartial: new Set()'), 'tests/diff-cover.test.ts 가 기존 FileCoverage 리터럴 3곳에 branchPartial: new Set() 추가(컴파일 영향 확인)')
must(diffCoverTest?.includes('분기 미검증'), 'tests/diff-cover.test.ts 에 formatReport 분기 미검증 렌더링 케이스 존재')

const goalFile = read('goals/98-eval-branch-coverage-schema.md')
must(goalFile?.includes('status: DONE'), 'goals/98 frontmatter 가 status: DONE')
must(goalFile?.includes('priority: P2'), 'goals/98 frontmatter 가 priority: P2')

if (pass) { console.log('✅ goal 98 gate passes'); process.exit(0) }
console.log('❌ goal 98 gate failed'); process.exit(1)
