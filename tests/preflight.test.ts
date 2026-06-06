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
  })
  const deps = {
    run: okRunner.run,
    nodeVersion: 'v20.18.0',
    hasLinter: false,
    worktreeEnv: (): PreflightCheck => ({ name: 'worktree env', status: 'pass', detail: 'ok', severity: 'critical' }),
  }

  it('8개 항목을 점검한다', () => {
    const checks = runPreflight({}, deps)
    expect(checks).toHaveLength(8)
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
})
