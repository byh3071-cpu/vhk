// Goal 29 — vhk preflight 코어(출고 전 안전점검).
// 외부 명령은 주입된 Runner 로만 호출 → 단위 테스트에서 safeExecFile mock 격리.
// 치명(critical) 실패 1개라도 있으면 blocked(차단). high/normal 은 경고만.

import type { CheckStatus, Severity, EnvCheckResult } from './worktree-env.js'

export type { CheckStatus, Severity }

// PreflightCheck 는 EnvCheckResult 와 동형 — worktree-env 모듈 결과를 그대로 합칠 수 있다.
export type PreflightCheck = EnvCheckResult

// 주입형 외부 명령 실행기. safeExecFile 을 얇게 감싼 형태.
export type Runner = (cmd: string, args: string[]) => { ok: boolean; out: string; err?: string }

export interface PreflightOptions {
  full?: boolean // 테스트를 전체 실행(--changed 캐시 미사용)
  mode?: 'default' | 'publish' | 'pr'
}

export interface PreflightDeps {
  run: Runner
  nodeVersion: string // 예: process.version ('v20.18.0')
  hasLinter: boolean // eslint 설정/스크립트 존재 여부
  worktreeEnv: () => PreflightCheck // checkWorktreeEnvDir 래핑(주입)
}

const check = (
  name: string,
  status: CheckStatus,
  detail: string,
  severity: Severity
): PreflightCheck => ({ name, status, detail, severity })

// ── 순수: Node .cmd shim CVE-2024-27980 안전 버전 판정 (20.12+ / 21.7+) ──
export function nodeMeetsShimSafe(version: string): boolean {
  const m = version.replace(/^v/, '').split('.')
  const major = Number(m[0])
  const minor = Number(m[1] ?? 0)
  if (!Number.isFinite(major)) return false
  if (major > 21) return true
  if (major === 21) return minor >= 7
  if (major === 20) return minor >= 12
  return false
}

// ── 개별 점검(주입 Runner) ──
export function checkNpmAuth(run: Runner): PreflightCheck {
  const r = run('npm', ['whoami'])
  if (r.ok && r.out.trim()) {
    return check('2FA / npm', 'pass', `logged in as ${r.out.trim()}`, 'high')
  }
  return check('2FA / npm', 'warn', 'npm 로그인 필요 (npm login). publish 시 2FA OTP는 사람이 직접 입력', 'high')
}

export function checkShim(nodeVersion: string): PreflightCheck {
  if (nodeMeetsShimSafe(nodeVersion)) {
    return check('shim', 'pass', `Node ${nodeVersion} (safe)`, 'high')
  }
  return check('shim', 'warn', `Node ${nodeVersion} — .cmd shim CVE 취약(20.12+/21.7+ 권장)`, 'high')
}

export function checkLint(run: Runner, hasLinter: boolean): PreflightCheck {
  if (!hasLinter) {
    return check('lint', 'skip', 'eslint 미설정 — 린트 스킵', 'critical')
  }
  const r = run('npx', ['eslint', '.'])
  return r.ok
    ? check('lint', 'pass', '0 errors', 'critical')
    : check('lint', 'fail', 'eslint 오류 — 출력 확인', 'critical')
}

export function checkTypecheck(run: Runner): PreflightCheck {
  const r = run('npx', ['tsc', '--noEmit'])
  return r.ok
    ? check('typecheck', 'pass', 'tsc --noEmit pass', 'critical')
    : check('typecheck', 'fail', 'tsc 타입 오류 — 출력 확인', 'critical')
}

export function checkTests(run: Runner, opts: { full?: boolean }): PreflightCheck {
  const args = opts.full ? ['vitest', '--run'] : ['vitest', '--changed', '--run']
  const r = run('npx', args)
  return r.ok
    ? check('tests', 'pass', opts.full ? '전체 통과' : '변경분 통과(캐시 스킵)', 'critical')
    : check('tests', 'fail', '테스트 실패 — 출력 확인', 'critical')
}

export function checkGitClean(run: Runner): PreflightCheck {
  const r = run('git', ['status', '--porcelain'])
  if (!r.ok) return check('git', 'warn', 'git 상태 확인 실패', 'normal')
  const lines = r.out.split('\n').filter((l) => l.trim())
  return lines.length === 0
    ? check('git', 'pass', 'clean', 'normal')
    : check('git', 'warn', `uncommitted ${lines.length} files`, 'normal')
}

export function checkBranch(run: Runner): PreflightCheck {
  const r = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
  const branch = r.out.trim()
  if (branch === 'main' || branch === 'master') {
    return check('branch', 'warn', `${branch} 직접 — feature 브랜치 권장(한 PR 한 goal)`, 'normal')
  }
  return check('branch', 'pass', branch || '(unknown)', 'normal')
}

// ── 집계 ──
export interface PreflightSummary {
  blocked: boolean // critical fail 1개라도 있으면 true
  passed: number
  warned: number
  failed: number
  skipped: number
}

export function summarizePreflight(checks: PreflightCheck[]): PreflightSummary {
  const s: PreflightSummary = { blocked: false, passed: 0, warned: 0, failed: 0, skipped: 0 }
  for (const c of checks) {
    if (c.status === 'pass') s.passed++
    else if (c.status === 'warn') s.warned++
    else if (c.status === 'fail') s.failed++
    else if (c.status === 'skip') s.skipped++
    if (c.status === 'fail' && c.severity === 'critical') s.blocked = true
  }
  return s
}

// lint 점검 활성 여부 — lint 스크립트 또는 eslint 설정 파일 존재 시. (값은 CLI가 fs/pkg에서 계산)
export function detectHasLinter(input: { hasLintScript: boolean; hasEslintConfig: boolean }): boolean {
  return input.hasLintScript || input.hasEslintConfig
}

// 출력 아이콘: 상태 우선, warn 은 severity 로 🟠(high)/🟡(normal) 구분.
export function statusIcon(c: PreflightCheck): string {
  if (c.status === 'pass') return '🟢'
  if (c.status === 'fail') return '🔴'
  if (c.status === 'skip') return '⚪'
  return c.severity === 'high' ? '🟠' : '🟡'
}

// ── 오케스트레이션: 8개 항목 점검(읽기 전용, Phase 1) ──
export function runPreflight(opts: PreflightOptions, deps: PreflightDeps): PreflightCheck[] {
  return [
    checkNpmAuth(deps.run),
    checkShim(deps.nodeVersion),
    deps.worktreeEnv(),
    checkLint(deps.run, deps.hasLinter),
    checkTypecheck(deps.run),
    checkTests(deps.run, { full: opts.full }),
    checkGitClean(deps.run),
    checkBranch(deps.run),
  ]
}
