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
  // #173: 패키지 스크립트 우선 실행용. 없으면 기존 npx 폴백(하위호환).
  pm?: string // 'pnpm' | 'yarn' | 'npm'
  scripts?: Record<string, string> // package.json scripts
  hasVitest?: boolean // vitest 설치/설정 여부 (없으면 테스트 하드코딩 강제 안 함)
}

/** 명령 실행 spec — 스크립트 우선 해석 결과. */
export type CmdSpec = { bin: string; args: string[] }

const check = (
  name: string,
  status: CheckStatus,
  detail: string,
  severity: Severity
): PreflightCheck => ({ name, status, detail, severity })

// #173: 실패 명령의 캡처 출력을 증거로 한 줄 요약(요약만 — 비밀 누출 우려 적은 stderr/stdout 앞부분).
function evidence(r: { out: string; err?: string }): string {
  const s = (r.err || r.out || '').trim().replace(/\s+/g, ' ')
  return s ? s.slice(0, 160) : '출력 확인'
}

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

// #173: lintCmd(패키지 스크립트) 있으면 그걸 실행, 없을 때만 npx eslint 폴백. 실패 시 출력 증거 포함.
export function checkLint(run: Runner, hasLinter: boolean, lintCmd?: CmdSpec): PreflightCheck {
  if (lintCmd) {
    const r = run(lintCmd.bin, lintCmd.args)
    return r.ok
      ? check('lint', 'pass', '0 errors', 'critical')
      : check('lint', 'fail', `lint 오류 — ${evidence(r)}`, 'critical')
  }
  if (!hasLinter) {
    return check('lint', 'skip', 'eslint 미설정 — 린트 스킵', 'critical')
  }
  const r = run('npx', ['eslint', '.'])
  return r.ok
    ? check('lint', 'pass', '0 errors', 'critical')
    : check('lint', 'fail', `eslint 오류 — ${evidence(r)}`, 'critical')
}

export function checkTypecheck(run: Runner): PreflightCheck {
  const r = run('npx', ['tsc', '--noEmit'])
  return r.ok
    ? check('typecheck', 'pass', 'tsc --noEmit pass', 'critical')
    : check('typecheck', 'fail', `tsc 타입 오류 — ${evidence(r)}`, 'critical')
}

// #173: testCmd 우선 — {bin,args}=그 스크립트 실행, null=테스트 수단 없음→skip, undefined=npx vitest 폴백.
export function checkTests(
  run: Runner,
  opts: { full?: boolean },
  testCmd?: CmdSpec | null
): PreflightCheck {
  if (testCmd === null) {
    return check('tests', 'skip', '테스트 스크립트/vitest 없음 — 스킵', 'critical')
  }
  const spec: CmdSpec = testCmd ?? {
    bin: 'npx',
    args: opts.full ? ['vitest', '--run'] : ['vitest', '--changed', '--run'],
  }
  const r = run(spec.bin, spec.args)
  const passDetail = testCmd ? '통과' : opts.full ? '전체 통과' : '변경분 통과(캐시 스킵)'
  return r.ok
    ? check('tests', 'pass', passDetail, 'critical')
    : check('tests', 'fail', `테스트 실패 — ${evidence(r)}`, 'critical')
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
  // #173: 패키지 스크립트 우선 해석. 모든 PM 이 `<pm> run <script>` 를 지원하므로 통일.
  const pm = deps.pm ?? 'npm'
  const scripts = deps.scripts ?? {}
  const mkCmd = (name: string): CmdSpec => ({ bin: pm, args: ['run', name] })

  const lintCmd = scripts.lint ? mkCmd('lint') : undefined

  // 테스트: 일회성(run) 스크립트 우선 → vitest 폴백 → 비-vitest test 스크립트 → 없으면 skip.
  // bare `test` 를 vitest 폴백보다 뒤에 두는 건 의도적 — `test:"vitest"`(watch) 가 preflight 를
  // 멈추게 하는 회귀 방지. (test:run/test:ci 는 관례상 일회성.)
  // harness(test:gate 우선)와 순서가 다른 것도 의도적 — preflight 는 읽기 전용 게이트라 deploy smoke
  // 등 side-effect 가능성이 있는 test:gate 보다 순수 일회성 test:run 을 우선한다.
  let testCmd: CmdSpec | null | undefined
  const testScriptName = ['test:run', 'test:ci', 'test:gate'].find((n) => scripts[n])
  if (testScriptName) testCmd = mkCmd(testScriptName)
  else if (deps.hasVitest) testCmd = undefined // npx vitest --changed/--run 폴백
  else if (scripts.test) testCmd = mkCmd('test') // 비-vitest test 스크립트(최후)
  else testCmd = null // 테스트 수단 없음 → skip(하드코딩 강제 안 함)

  return [
    checkNpmAuth(deps.run),
    checkShim(deps.nodeVersion),
    deps.worktreeEnv(),
    checkLint(deps.run, deps.hasLinter, lintCmd),
    checkTypecheck(deps.run),
    checkTests(deps.run, { full: opts.full }, testCmd),
    checkGitClean(deps.run),
    checkBranch(deps.run),
  ]
}
