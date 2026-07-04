import { describe, it, expect } from 'vitest'
import {
  nodeMeetsShimSafe,
  checkNpmAuth,
  checkShim,
  checkLint,
  checkTypecheck,
  checkTests,
  checkGitClean,
  checkBranch,
  checkDocsFreshness,
  DOCS_FRESHNESS_WARN_DAYS,
  DOCS_FRESHNESS_FILE,
  summarizePreflight,
  runPreflight,
  detectHasLinter,
  statusIcon,
  type Runner,
  type PreflightCheck,
} from '../src/lib/preflight.js'

// 호출 기록 + 지정 응답을 주는 mock runner.
function mockRunner(responses: Record<string, { ok: boolean; out: string; err?: string }>): {
  run: Runner
  calls: string[]
} {
  const calls: string[] = []
  const run: Runner = (cmd, args) => {
    const key = `${cmd} ${args.join(' ')}`.trim()
    calls.push(key)
    return responses[key] ?? { ok: true, out: '' }
  }
  return { run, calls }
}

describe('nodeMeetsShimSafe', () => {
  it('20.12+ 는 안전', () => {
    expect(nodeMeetsShimSafe('v20.18.0')).toBe(true)
    expect(nodeMeetsShimSafe('v20.12.0')).toBe(true)
  })
  it('20.11 이하는 취약', () => {
    expect(nodeMeetsShimSafe('v20.11.0')).toBe(false)
  })
  it('21.7+ 안전, 21.6 이하 취약', () => {
    expect(nodeMeetsShimSafe('v21.7.0')).toBe(true)
    expect(nodeMeetsShimSafe('v21.6.0')).toBe(false)
  })
  it('22+ 는 안전', () => {
    expect(nodeMeetsShimSafe('v22.0.0')).toBe(true)
  })
})

describe('checkShim', () => {
  it('안전 버전 → pass (high)', () => {
    const r = checkShim('v20.18.0')
    expect(r.status).toBe('pass')
    expect(r.severity).toBe('high')
  })
  it('취약 버전 → warn', () => {
    expect(checkShim('v20.10.0').status).toBe('warn')
  })
})

describe('checkNpmAuth', () => {
  it('whoami 성공 → pass', () => {
    const { run } = mockRunner({ 'npm whoami': { ok: true, out: 'byh3071' } })
    const r = checkNpmAuth(run)
    expect(r.status).toBe('pass')
    expect(r.detail).toContain('byh3071')
  })
  it('whoami 실패 → warn (high, 차단 아님)', () => {
    const { run } = mockRunner({ 'npm whoami': { ok: false, out: '', err: 'ENEEDAUTH' } })
    const r = checkNpmAuth(run)
    expect(r.status).toBe('warn')
    expect(r.severity).toBe('high')
  })
})

describe('checkLint', () => {
  it('린터 미설정 → skip (차단 안 함)', () => {
    const { run, calls } = mockRunner({})
    const r = checkLint(run, false)
    expect(r.status).toBe('skip')
    expect(calls).toEqual([]) // 린터 없으면 실행조차 안 함
  })
  it('린터 있고 통과 → pass', () => {
    const { run } = mockRunner({ 'npx eslint .': { ok: true, out: '' } })
    expect(checkLint(run, true).status).toBe('pass')
  })
  it('린터 있고 실패 → critical fail', () => {
    const { run } = mockRunner({ 'npx eslint .': { ok: false, out: '', err: 'errors' } })
    const r = checkLint(run, true)
    expect(r.status).toBe('fail')
    expect(r.severity).toBe('critical')
  })
})

describe('checkTypecheck', () => {
  it('tsc 통과 → pass (critical)', () => {
    const { run } = mockRunner({ 'npx tsc --noEmit': { ok: true, out: '' } })
    const r = checkTypecheck(run)
    expect(r.status).toBe('pass')
    expect(r.severity).toBe('critical')
  })
  it('tsc 실패 → fail', () => {
    const { run } = mockRunner({ 'npx tsc --noEmit': { ok: false, out: 'TS2322', err: '' } })
    expect(checkTypecheck(run).status).toBe('fail')
  })
  it('#245: typecheckCmd=null(tsconfig·스크립트 없음)이면 skip — 바닐라 JS 차단 안 함', () => {
    const { run } = mockRunner({})
    const r = checkTypecheck(run, null)
    expect(r.status).toBe('skip')
  })
  it('#245: typecheck 스크립트(CmdSpec) 주면 그걸 실행', () => {
    const { run } = mockRunner({ 'pnpm run typecheck': { ok: true, out: '' } })
    const r = checkTypecheck(run, { bin: 'pnpm', args: ['run', 'typecheck'] })
    expect(r.status).toBe('pass')
  })
})

describe('checkTests', () => {
  it('기본은 --changed (캐시 스킵)', () => {
    const { run, calls } = mockRunner({})
    checkTests(run, {})
    expect(calls[0]).toContain('--changed')
  })
  it('--full 은 전체 실행 (--changed 없음)', () => {
    const { run, calls } = mockRunner({})
    checkTests(run, { full: true })
    expect(calls[0]).not.toContain('--changed')
  })
  it('테스트 실패 → critical fail', () => {
    const { run } = mockRunner({ 'npx vitest --changed --run': { ok: false, out: '1 failed', err: '' } })
    const r = checkTests(run, {})
    expect(r.status).toBe('fail')
    expect(r.severity).toBe('critical')
  })
})

describe('#173 — 스크립트 우선 + 출력 증거', () => {
  it('lint 스크립트 있으면 npx eslint 대신 스크립트 실행', () => {
    const { run, calls } = mockRunner({ 'pnpm run lint': { ok: true, out: '' } })
    const r = checkLint(run, true, { bin: 'pnpm', args: ['run', 'lint'] })
    expect(r.status).toBe('pass')
    expect(calls).toContain('pnpm run lint')
    expect(calls).not.toContain('npx eslint .')
  })

  it('lint 실패 시 출력 증거(detail)에 캡처', () => {
    const { run } = mockRunner({ 'npx eslint .': { ok: false, out: '', err: '5 problems (5 errors)' } })
    const r = checkLint(run, true)
    expect(r.status).toBe('fail')
    expect(r.detail).toContain('5 problems')
  })

  it('test:run 스크립트 있으면 vitest 대신 스크립트 실행', () => {
    const { run, calls } = mockRunner({ 'pnpm run test:run': { ok: true, out: '' } })
    const r = checkTests(run, {}, { bin: 'pnpm', args: ['run', 'test:run'] })
    expect(r.status).toBe('pass')
    expect(calls).toContain('pnpm run test:run')
    expect(calls).not.toContain('npx vitest --changed --run')
  })

  it('테스트 도구/스크립트 없으면 skip (하드코딩 vitest 강제 안 함)', () => {
    const { run, calls } = mockRunner({})
    const r = checkTests(run, {}, null)
    expect(r.status).toBe('skip')
    expect(calls).toEqual([])
  })

  it('runPreflight 가 test:run/lint 스크립트를 우선 실행 (하드코딩 회피)', () => {
    const { run, calls } = mockRunner({})
    runPreflight(
      {},
      {
        run,
        nodeVersion: 'v20.18.0',
        hasLinter: true,
        worktreeEnv: (): PreflightCheck => ({ name: 'worktree env', status: 'pass', detail: '', severity: 'critical' }),
        pm: 'pnpm',
        scripts: { lint: 'eslint', 'test:run': 'vitest --run' },
        hasVitest: true,
      }
    )
    expect(calls).toContain('pnpm run lint')
    expect(calls).toContain('pnpm run test:run')
    expect(calls).not.toContain('npx eslint .')
    expect(calls).not.toContain('npx vitest --changed --run')
  })
})

// #292-G5: docs/state/next-task.md 신선도 경고(차단 아님). NOW/DAY 는 version-check.test.ts 패턴 차용
// (고정 NOW 상수 + 오프셋 계산으로 결정론적 테스트, 실제 Date.now() 호출 없음).
describe('checkDocsFreshness', () => {
  const NOW = 1_700_000_000_000
  const DAY = 24 * 60 * 60 * 1000
  const gitLogKey = `git log -1 --format=%ct -- ${DOCS_FRESHNESS_FILE}`
  const tsFor = (msAgo: number): string => String(Math.floor((NOW - msAgo) / 1000))

  it('3일 전 갱신 → pass (normal)', () => {
    const { run } = mockRunner({ [gitLogKey]: { ok: true, out: tsFor(3 * DAY) } })
    const r = checkDocsFreshness(run, { now: NOW })
    expect(r.status).toBe('pass')
    expect(r.severity).toBe('normal')
  })

  it('정확히 임계값(7일) 경계 → pass (초과 아님, off-by-one 방지)', () => {
    const { run } = mockRunner({
      [gitLogKey]: { ok: true, out: tsFor(DOCS_FRESHNESS_WARN_DAYS * DAY) },
    })
    const r = checkDocsFreshness(run, { now: NOW })
    expect(r.status).toBe('pass')
  })

  it('임계값 초과(10일) → warn (normal, critical 아님)', () => {
    const { run } = mockRunner({ [gitLogKey]: { ok: true, out: tsFor(10 * DAY) } })
    const r = checkDocsFreshness(run, { now: NOW })
    expect(r.status).toBe('warn')
    expect(r.severity).toBe('normal')
  })

  it('git log 실패(r.ok=false) → skip', () => {
    const { run } = mockRunner({ [gitLogKey]: { ok: false, out: '', err: 'no such path' } })
    const r = checkDocsFreshness(run, { now: NOW })
    expect(r.status).toBe('skip')
  })

  it('출력 빈 문자열 → skip', () => {
    const { run } = mockRunner({ [gitLogKey]: { ok: true, out: '' } })
    const r = checkDocsFreshness(run, { now: NOW })
    expect(r.status).toBe('skip')
  })

  it('출력 파싱 불가(숫자 아님) → skip', () => {
    const { run } = mockRunner({ [gitLogKey]: { ok: true, out: 'not-a-number' } })
    const r = checkDocsFreshness(run, { now: NOW })
    expect(r.status).toBe('skip')
  })

  it('thresholdDays 커스텀 오버라이드(3일) — 5일 경과면 warn', () => {
    const { run } = mockRunner({ [gitLogKey]: { ok: true, out: tsFor(5 * DAY) } })
    const r = checkDocsFreshness(run, { now: NOW, thresholdDays: 3 })
    expect(r.status).toBe('warn')
  })
})

describe('checkGitClean', () => {
  it('변경 없음 → pass', () => {
    const { run } = mockRunner({ 'git status --porcelain': { ok: true, out: '' } })
    expect(checkGitClean(run).status).toBe('pass')
  })
  it('uncommitted 있음 → warn (normal)', () => {
    const { run } = mockRunner({ 'git status --porcelain': { ok: true, out: ' M a.ts\n?? b.ts' } })
    const r = checkGitClean(run)
    expect(r.status).toBe('warn')
    expect(r.severity).toBe('normal')
  })
})

describe('checkBranch', () => {
  it('feature 브랜치 → pass', () => {
    const { run } = mockRunner({ 'git rev-parse --abbrev-ref HEAD': { ok: true, out: 'feat/x' } })
    expect(checkBranch(run).status).toBe('pass')
  })
  it('main 직접 → warn', () => {
    const { run } = mockRunner({ 'git rev-parse --abbrev-ref HEAD': { ok: true, out: 'main' } })
    expect(checkBranch(run).status).toBe('warn')
  })
})

describe('summarizePreflight', () => {
  const mk = (status: PreflightCheck['status'], severity: PreflightCheck['severity']): PreflightCheck => ({
    name: 'x', status, detail: '', severity,
  })
  it('critical fail 있으면 blocked', () => {
    const s = summarizePreflight([mk('pass', 'critical'), mk('fail', 'critical')])
    expect(s.blocked).toBe(true)
    expect(s.failed).toBe(1)
  })
  it('high/normal fail 은 차단 안 함', () => {
    const s = summarizePreflight([mk('warn', 'high'), mk('warn', 'normal')])
    expect(s.blocked).toBe(false)
    expect(s.warned).toBe(2)
  })
  it('전부 pass → blocked 아님', () => {
    expect(summarizePreflight([mk('pass', 'critical'), mk('skip', 'critical')]).blocked).toBe(false)
  })
})

describe('detectHasLinter', () => {
  it('lint 스크립트 있으면 true', () => {
    expect(detectHasLinter({ hasLintScript: true, hasEslintConfig: false })).toBe(true)
  })
  it('eslint config 있으면 true', () => {
    expect(detectHasLinter({ hasLintScript: false, hasEslintConfig: true })).toBe(true)
  })
  it('둘 다 없으면 false', () => {
    expect(detectHasLinter({ hasLintScript: false, hasEslintConfig: false })).toBe(false)
  })
})

describe('statusIcon', () => {
  const mk = (status: PreflightCheck['status'], severity: PreflightCheck['severity']): PreflightCheck => ({
    name: 'x', status, detail: '', severity,
  })
  it('pass → 🟢, fail → 🔴, skip → ⚪', () => {
    expect(statusIcon(mk('pass', 'normal'))).toBe('🟢')
    expect(statusIcon(mk('fail', 'critical'))).toBe('🔴')
    expect(statusIcon(mk('skip', 'critical'))).toBe('⚪')
  })
  it('warn 은 severity로 구분: high → 🟠, normal → 🟡', () => {
    expect(statusIcon(mk('warn', 'high'))).toBe('🟠')
    expect(statusIcon(mk('warn', 'normal'))).toBe('🟡')
  })
})

describe('runPreflight', () => {
  const okRunner = mockRunner({
    'npm whoami': { ok: true, out: 'me' },
    'npx tsc --noEmit': { ok: true, out: '' },
    'npx vitest --changed --run': { ok: true, out: '' },
    'git status --porcelain': { ok: true, out: '' },
    'git rev-parse --abbrev-ref HEAD': { ok: true, out: 'feat/29-preflight' },
    // #292-G5: 오늘 커밋으로 mock — 항상 fresh(pass) 처리되어 기존 "정상환경 → blocked 아님" 회귀 없음.
    [`git log -1 --format=%ct -- ${DOCS_FRESHNESS_FILE}`]: {
      ok: true,
      out: String(Math.floor(Date.now() / 1000)),
    },
  })
  const deps = {
    run: okRunner.run,
    nodeVersion: 'v20.18.0',
    hasLinter: false,
    worktreeEnv: (): PreflightCheck => ({ name: 'worktree env', status: 'pass', detail: 'ok', severity: 'critical' }),
  }

  it('9개 항목을 점검한다', () => {
    const checks = runPreflight({}, deps)
    expect(checks).toHaveLength(9)
  })
  it('정상 환경 → blocked 아님', () => {
    const checks = runPreflight({}, deps)
    expect(summarizePreflight(checks).blocked).toBe(false)
  })
  it('worktree env 누락(critical fail) → blocked', () => {
    const checks = runPreflight({}, {
      ...deps,
      worktreeEnv: (): PreflightCheck => ({ name: 'worktree env', status: 'fail', detail: '누락', severity: 'critical' }),
    })
    expect(summarizePreflight(checks).blocked).toBe(true)
  })
  it('#245: tsconfig 없고 typecheck 스크립트도 없으면 typecheck skip(차단 아님)', () => {
    const checks = runPreflight({}, { ...deps, hasTsconfig: false })
    const tc = checks.find((c) => c.name === 'typecheck')
    expect(tc?.status).toBe('skip')
    expect(summarizePreflight(checks).blocked).toBe(false)
  })
  it('#245: tsconfig 있으면 typecheck 실행(npx tsc 폴백)', () => {
    const checks = runPreflight({}, { ...deps, hasTsconfig: true })
    const tc = checks.find((c) => c.name === 'typecheck')
    expect(tc?.status).toBe('pass')
  })

  it('#292-G5: docs freshness 가 warn(오래됨)이어도 blocked 아님(severity normal)', () => {
    const staleRunner = mockRunner({
      'npm whoami': { ok: true, out: 'me' },
      'npx tsc --noEmit': { ok: true, out: '' },
      'npx vitest --changed --run': { ok: true, out: '' },
      'git status --porcelain': { ok: true, out: '' },
      'git rev-parse --abbrev-ref HEAD': { ok: true, out: 'feat/29-preflight' },
      [`git log -1 --format=%ct -- ${DOCS_FRESHNESS_FILE}`]: {
        ok: true,
        out: String(Math.floor((Date.now() - 10 * 24 * 60 * 60 * 1000) / 1000)),
      },
    })
    const checks = runPreflight({}, { ...deps, run: staleRunner.run })
    const df = checks.find((c) => c.name === 'docs freshness')
    expect(df?.status).toBe('warn')
    expect(summarizePreflight(checks).blocked).toBe(false)
  })
})
