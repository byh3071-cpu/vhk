import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'
import { readConfig } from '../lib/config.js'
import { SAFETY_MODE_DESC } from '../lib/safety-mode.js'
import { printNextStep } from '../lib/next-step.js'
import { ensureNotHardStopped } from '../lib/hard-stop-guard.js'
import { ensureVhkIgnored } from '../lib/backup.js'
import { readJsonFile } from '../lib/read-json.js'
import { localDate } from '../lib/date.js'
import { atomicWriteFile } from '../lib/atomic-write.js'
import { scanProjectForSecrets, filterSevereFindings } from '../lib/scan-secrets.js'
import { renderReportHtml } from './verify-report.js'
import { isInteractive } from '../lib/interactive.js'
import { safeExecFile } from '../lib/exec.js'

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
/** Goal 14: 사람용 정적 HTML 리포트 경로(같은 증거 latest.json 을 렌더). */
export const REPORT_HTML_PATH_REL = join(REPORT_DIR_REL, 'latest.html')

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
 * package.json 의 scripts 를 안전하게 읽는다. **절대 throw 하지 않는다** —
 * verify 의 핵심 계약("성공·실패 무관 항상 증거 남김")을 지키려면 package.json 파싱이
 * verifyEvidence 보다 먼저 죽으면 안 된다. readJsonFile 로 UTF-8 BOM(PowerShell
 * Set-Content -Encoding utf8 등) 제거 + 손상/없음이면 빈 객체(→ 외부 게이트 skip, 거짓 PASS 금지).
 */
export function readPackageScripts(cwd: string): Record<string, string> {
  const pkgPath = join(cwd, 'package.json')
  if (!existsSync(pkgPath)) return {}
  try {
    const pkg = readJsonFile<{ scripts?: Record<string, string> }>(pkgPath)
    return pkg.scripts ?? {}
  } catch {
    // BOM 외 손상(깨진 JSON) → 빈 scripts. verify 는 죽지 않고 증거는 남긴다.
    return {}
  }
}

/**
 * 게이트 4종 실행 → 결과 배열. tsc/test/build 는 외부 프로세스(실제 종료코드),
 * secure 는 in-process 스캐너(시크릿 본문 미수집 — count 만).
 */
export function runGates(cwd: string): GateResult[] {
  const scripts = readPackageScripts(cwd)
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
  atomicWriteFile(path, JSON.stringify(report, null, 2) + '\n')
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

/**
 * Goal 14: `--report` — latest.json 을 사람용 정적 HTML 로 렌더.
 * 새 증거를 만들지 않는다(단일 진실원천) — latest.json 이 있으면 읽고(BOM-safe),
 * 없으면 verify 1회 선실행해 증거를 만든 뒤 같은 report 를 렌더.
 */
async function renderVerifyReport(cwd: string, opts: { open?: boolean }): Promise<void> {
  const jsonPath = join(cwd, REPORT_PATH_REL)
  let report: VerifyReport
  if (existsSync(jsonPath)) {
    try {
      report = readJsonFile<VerifyReport>(jsonPath)
    } catch {
      // 손상된 latest.json → verify 재실행으로 증거 재생성(렌더 전용 원칙 유지: 깨진 증거는 무효).
      console.log(chalk.yellow('  ⚠️  기존 latest.json 손상 — verify 재실행으로 증거를 다시 만듭니다.'))
      report = verifyEvidence(cwd).report
    }
  } else {
    console.log(chalk.dim('  latest.json 없음 — verify 1회 선실행으로 증거를 만듭니다.'))
    report = verifyEvidence(cwd).report
  }

  const html = renderReportHtml(report)
  const htmlPath = join(cwd, REPORT_HTML_PATH_REL)
  try {
    mkdirSync(join(cwd, REPORT_DIR_REL), { recursive: true })
    atomicWriteFile(htmlPath, html)
  } catch (e) {
    // 쓰기 권한 없음 등 → 크래시 대신 친절 안내 + 비-0 종료.
    console.error(
      chalk.red(`  ❌ 리포트 HTML 을 쓸 수 없습니다 (${REPORT_HTML_PATH_REL}): ${e instanceof Error ? e.message : String(e)}`)
    )
    console.error(chalk.dim('     해당 경로의 쓰기 권한을 확인하세요.'))
    process.exitCode = 1
    return
  }

  console.log(chalk.bold('\n🔎 검증 리포트 (verify --report)'))
  console.log(`  결과: ${STATUS_BADGE[report.status]}`)
  console.log(chalk.dim(`  📄 HTML: ${REPORT_HTML_PATH_REL}`))
  process.exitCode = report.status === 'FAIL' ? 1 : 0

  if (opts.open) {
    // 비대화형/CI/MCP(비-TTY)에서는 브라우저 열기 자동 스킵.
    if (isInteractive()) openReportInBrowser(htmlPath)
    else console.log(chalk.dim('  (비대화형/CI/MCP — --open 자동 스킵)'))
    return
  }
  printNextStep({
    message: '리포트 생성 완료. 브라우저로 열려면:',
    command: 'vhk verify --report --open',
    cursorHint: '리포트 열어줘',
  })
}

/** 기본 브라우저로 로컬 HTML 열기 — shell 없는 argv 호출(ref.ts 패턴 답습, 인젝션 차단). */
function openReportInBrowser(filePath: string): void {
  let result
  if (process.platform === 'darwin') {
    result = safeExecFile('open', [filePath])
  } else if (process.platform === 'win32') {
    // rundll32 url.dll,FileProtocolHandler: 쉘 없이 ShellExecute → cmd 파싱 없음.
    result = safeExecFile('rundll32.exe', ['url.dll,FileProtocolHandler', filePath])
  } else {
    result = safeExecFile('xdg-open', [filePath])
  }
  if (result.ok) console.log(chalk.green('  ✅ 브라우저에서 열었습니다.'))
  else console.log(chalk.yellow('  ⚠️  브라우저를 열 수 없습니다. 위 파일을 직접 여세요.'))
}

export async function verify(opts: { json?: boolean; report?: boolean; open?: boolean } = {}): Promise<void> {
  // HARD_STOP 활성 → 게이트 실행 거부 + exit 1 (PRD §9).
  if (!ensureNotHardStopped('verify')) return

  const cwd = process.cwd()

  // --report: latest.json → 사람용 HTML 렌더(증거는 만들지 않고 읽음; 없으면 선실행). json 보다 우선.
  if (opts.report) {
    await renderVerifyReport(cwd, opts)
    return
  }

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
