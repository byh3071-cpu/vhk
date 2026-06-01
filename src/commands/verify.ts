import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'
import { readConfig } from '../lib/config.js'
import { SAFETY_MODE_DESC } from '../lib/safety-mode.js'
import { printNextStep } from '../lib/next-step.js'
import { ensureNotHardStopped } from '../lib/hard-stop-guard.js'
import { ensureVhkIgnored } from '../lib/backup.js'
import { localDate } from '../lib/date.js'
import { scanProjectForSecrets, filterSevereFindings } from '../lib/scan-secrets.js'

/**
 * 저장/위험 작업 전 돌려야 하는 검증 묶음.
 * Goal 13(Evidence Ledger v0): lite 안내층을 **실제 실행 + 증거 기록**으로 승격.
 * 게이트(typecheck/test/build/secure)를 실제로 돌리고 결과를 `.vhk/reports/latest.json` 으로 남긴다.
 * 철학: ① 결과는 실제 종료코드에서만(거짓 PASS 금지) ② 성공·실패 무관 항상 증거 ③ Windows 1급
 *      ④ 기존 verify 시그니처 호환(옵션 추가만).
 */

/** 권장 검증 묶음 안내 (사람용 체크리스트 — Goal 13 이전부터 쓰던 SoT, mode 등이 참조). */
export function verificationChecklist(): string[] {
  return [
    '타입 체크 — pnpm exec tsc --noEmit',
    '테스트 — pnpm run test:run',
    '빌드 — pnpm run build',
    '보안 스캔 — vhk secure scan',
  ]
}

export const REPORT_SCHEMA_VERSION = 1
export const REPORT_DIR_REL = join('.vhk', 'reports')
export const REPORT_PATH_REL = join(REPORT_DIR_REL, 'latest.json')

export type GateRunStatus = 'pass' | 'fail' | 'skip'
export type ReportStatus = 'PASS' | 'WARN' | 'FAIL'

export interface GateResult {
  /** 안정 식별자 (기계용) */
  id: 'typecheck' | 'test' | 'build' | 'secure'
  /** 사람용 라벨 */
  label: string
  status: GateRunStatus
  /** 실제 프로세스 종료코드. skip/in-process 게이트는 null. */
  exitCode: number | null
  skipped: boolean
  /** 사람용 한 줄 사유 (시크릿 본문은 절대 넣지 않음 — count 등 메타만). */
  detail?: string
}

export interface VerifyReport {
  schemaVersion: number
  /** 머신 타임스탬프 (UTC ISO) */
  generatedAt: string
  /** 사람용 날짜 (localDate, 로컬 타임존) */
  date: string
  status: ReportStatus
  summary: { total: number; pass: number; fail: number; skip: number }
  gates: GateResult[]
  nextActions: string[]
}

const SHIM = new Set(['pnpm', 'npm', 'npx', 'yarn'])

/** 패키지 매니저 감지 (lockfile 기준). cwd 상대. */
export function detectPm(cwd: string): 'pnpm' | 'yarn' | 'npm' {
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn'
  return 'npm'
}

/**
 * 외부 게이트 1개 실행 + **실제 종료코드** 수집. 파이프로 exit code 를 가리지 않는다.
 * Windows: pnpm/npm/yarn 은 .cmd shim → cmd.exe 래핑(Node CVE-2024-27980 의 EINVAL 회피).
 * maxBuffer 상향(64MB): 큰 빌드/테스트 로그(>1MB)에서 성공해도 ENOBUFS 거짓실패 방지.
 */
export function execGate(cmd: string, args: string[], cwd: string): { exitCode: number; out: string } {
  let bin = cmd
  let argv = args
  if (process.platform === 'win32' && SHIM.has(cmd)) {
    bin = 'cmd.exe'
    argv = ['/d', '/s', '/c', `${cmd}.cmd`, ...args]
  }
  try {
    execFileSync(bin, argv, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
      timeout: 600_000,
      killSignal: 'SIGTERM',
    })
    return { exitCode: 0, out: '' }
  } catch (e) {
    const err = e as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string; code?: string }
    // execFileSync 는 비-0 종료 시 err.status = 종료코드. ENOENT 등 실행 자체 실패는 status 없음 → 1 로 기록(추측 금지).
    const exitCode = typeof err.status === 'number' ? err.status : 1
    const out = ((err.stdout?.toString?.() ?? '') + (err.stderr?.toString?.() ?? '')).trim()
    return { exitCode, out }
  }
}

/** typecheck/test/build 외부 게이트 1종 실행. 스크립트/설정 없으면 skip(WARN) — 거짓 PASS 금지. */
function runScriptGate(
  id: 'typecheck' | 'test' | 'build',
  label: string,
  cwd: string,
  pm: 'pnpm' | 'yarn' | 'npm',
  argvFor: (pm: string) => string[] | null
): GateResult {
  const argv = argvFor(pm)
  if (!argv) {
    return { id, label, status: 'skip', exitCode: null, skipped: true, detail: '해당 스크립트/설정 없음 — skip(WARN)' }
  }
  const { exitCode } = execGate(pm, argv, cwd)
  return {
    id,
    label,
    status: exitCode === 0 ? 'pass' : 'fail',
    exitCode,
    skipped: false,
    detail: exitCode === 0 ? undefined : `종료코드 ${exitCode}`,
  }
}

/**
 * 게이트 4종 실행 → 결과 배열. tsc/test/build 는 외부 프로세스(실제 종료코드),
 * secure 는 in-process 스캐너(시크릿 본문 미수집 — count 만).
 */
export function runGates(cwd: string): GateResult[] {
  const pkgPath = join(cwd, 'package.json')
  const pkg = existsSync(pkgPath)
    ? (JSON.parse(readFileSync(pkgPath, 'utf-8')) as { scripts?: Record<string, string> })
    : {}
  const scripts = pkg.scripts ?? {}
  const pm = detectPm(cwd)
  const gates: GateResult[] = []

  // typecheck — scripts.typecheck 우선, 없으면 tsconfig.json 있을 때 tsc --noEmit, 둘 다 없으면 skip
  gates.push(
    runScriptGate('typecheck', 'tsc --noEmit', cwd, pm, () => {
      if (scripts.typecheck) return ['run', 'typecheck']
      if (existsSync(join(cwd, 'tsconfig.json'))) return pm === 'npm' ? ['exec', '--', 'tsc', '--noEmit'] : ['exec', 'tsc', '--noEmit']
      return null
    })
  )

  // test — test:run 우선, vitest test 면 --run, 그 외 test, 없으면 skip
  gates.push(
    runScriptGate('test', 'test:run', cwd, pm, () => {
      if (scripts['test:run']) return ['run', 'test:run']
      if (scripts.test && /vitest/.test(scripts.test)) return ['run', 'test', '--', '--run']
      if (scripts.test) return ['run', 'test']
      return null
    })
  )

  // build — scripts.build 없으면 skip
  gates.push(
    runScriptGate('build', 'build', cwd, pm, () => (scripts.build ? ['run', 'build'] : null))
  )

  // secure — in-process 스캔. 시크릿 본문은 리포트에 넣지 않고 severe count 만 기록(누출 0).
  gates.push(runSecureGate(cwd))

  return gates
}

/** 보안 스캔 게이트 — severe(critical/high) 발견 시 fail. 시크릿 값은 리포트 미포함(count 만). */
export function runSecureGate(cwd: string): GateResult {
  try {
    const severe = filterSevereFindings(scanProjectForSecrets(cwd).findings)
    const n = severe.length
    return {
      id: 'secure',
      label: 'secure scan',
      status: n === 0 ? 'pass' : 'fail',
      exitCode: n === 0 ? 0 : 1,
      skipped: false,
      detail: n === 0 ? undefined : `severe 시크릿 ${n}건 (값 미기록 — vhk secure scan 으로 확인)`,
    }
  } catch (e) {
    // 스캔 자체 실패 → fail 로 기록(추측 금지).
    return {
      id: 'secure',
      label: 'secure scan',
      status: 'fail',
      exitCode: 1,
      skipped: false,
      detail: `스캔 실행 실패: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

/** 게이트 결과 → 전체 상태. fail 하나라도 → FAIL, 없고 skip 있으면 → WARN, 전부 pass → PASS. */
export function aggregateStatus(gates: GateResult[]): ReportStatus {
  if (gates.some((g) => g.status === 'fail')) return 'FAIL'
  if (gates.some((g) => g.status === 'skip')) return 'WARN'
  return 'PASS'
}

/** 실패/스킵 게이트로부터 다음 행동 힌트 생성 (사람·에이전트 공용). */
export function buildNextActions(gates: GateResult[]): string[] {
  const actions: string[] = []
  for (const g of gates) {
    if (g.status === 'fail') {
      if (g.id === 'secure') actions.push('시크릿 제거 후 재검증 — vhk secure scan 으로 위치 확인')
      else actions.push(`${g.label} 실패(종료코드 ${g.exitCode}) — 로그 확인 후 수정`)
    } else if (g.status === 'skip') {
      actions.push(`${g.label} 게이트 없음 — package.json scripts 에 추가하면 검증 커버리지 ↑`)
    }
  }
  if (actions.length === 0) actions.push('검증 통과 — vhk save 로 저장하세요.')
  return actions
}

/** 게이트 결과 → 리포트 객체(스키마). head(요약·기계용) + body(gates·사람용). */
export function buildReport(gates: GateResult[], generatedAt: string, date: string): VerifyReport {
  const summary = {
    total: gates.length,
    pass: gates.filter((g) => g.status === 'pass').length,
    fail: gates.filter((g) => g.status === 'fail').length,
    skip: gates.filter((g) => g.status === 'skip').length,
  }
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt,
    date,
    status: aggregateStatus(gates),
    summary,
    gates,
    nextActions: buildNextActions(gates),
  }
}

/**
 * 게이트 실행 → 리포트 생성/기록. **항상** `.vhk/reports/latest.json` 을 쓴다(성공·실패 무관).
 * reports/ 는 로컬 전용 산출물 → `.vhk/.gitignore` 에 등록(클라우드/추적 제외, RFC 0038).
 * @returns 리포트 객체 + 기록 경로
 */
export function verifyEvidence(cwd: string = process.cwd()): { report: VerifyReport; path: string } {
  const gates = runGates(cwd)
  const report = buildReport(gates, new Date().toISOString(), localDate())

  const dir = join(cwd, REPORT_DIR_REL)
  mkdirSync(dir, { recursive: true })
  const path = join(cwd, REPORT_PATH_REL)
  writeFileSync(path, JSON.stringify(report, null, 2) + '\n', 'utf-8')
  // reports/ 는 개인 환경 산물 → 로컬 전용(추적·클라우드 제외).
  try {
    ensureVhkIgnored(cwd, 'reports/')
  } catch {
    /* gitignore 갱신 실패는 치명적 아님 — 리포트는 이미 기록됨 */
  }

  return { report, path: REPORT_PATH_REL }
}

const STATUS_BADGE: Record<ReportStatus, string> = {
  PASS: chalk.green.bold('PASS'),
  WARN: chalk.yellow.bold('WARN'),
  FAIL: chalk.red.bold('FAIL'),
}

export async function verify(opts: { json?: boolean } = {}): Promise<void> {
  // HARD_STOP 활성 → 게이트 실행 거부 + exit 1 (PRD §9).
  if (!ensureNotHardStopped('verify')) return

  const cwd = process.cwd()
  const { report, path } = verifyEvidence(cwd)

  // --json: 경로 대신 stdout 으로 리포트 JSON (CI 용). 다른 콘솔 출력 없음.
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2))
    process.exitCode = report.status === 'FAIL' ? 1 : 0
    return
  }

  console.log(chalk.bold('\n🔎 검증 묶음 (verify)'))
  console.log(chalk.gray('─'.repeat(40)))
  const mode = readConfig().safetyMode
  console.log(chalk.dim(`  현재 Safety Mode: ${mode} — ${SAFETY_MODE_DESC[mode]}`))

  // 게이트별 한 줄
  const icon = (s: GateRunStatus) => (s === 'pass' ? chalk.green('✓') : s === 'fail' ? chalk.red('✗') : chalk.yellow('⊘'))
  for (const g of report.gates) {
    const tail = g.detail ? chalk.dim(` — ${g.detail}`) : ''
    console.log(`   ${icon(g.status)} ${g.label}${tail}`)
  }

  // 한 줄 요약 + 파일 경로
  const s = report.summary
  console.log(
    `\n  결과: ${STATUS_BADGE[report.status]}  ` +
      chalk.dim(`(pass ${s.pass} / fail ${s.fail} / skip ${s.skip}, 총 ${s.total})`)
  )
  console.log(chalk.dim(`  📄 증거: ${path}`))

  process.exitCode = report.status === 'FAIL' ? 1 : 0

  if (report.status === 'FAIL') {
    printNextStep({
      message: '검증 실패 — 아래를 먼저 고치세요:',
      command: 'vhk verify',
      cursorHint: '검증 다시 돌려줘',
      alternative: report.nextActions[0],
    })
  } else {
    printNextStep({
      message: report.status === 'WARN' ? '검증 통과(일부 게이트 skip). 저장하려면:' : '검증 통과! 저장하려면:',
      command: 'vhk save',
      cursorHint: '저장해줘',
    })
  }
}
