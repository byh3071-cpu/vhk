import chalk from 'chalk'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { printNextStep } from '../lib/next-step.js'
import { ko } from '../i18n/ko.js'
import { projectMaturity } from '../lib/project-maturity.js'
import { readJsonFile } from '../lib/read-json.js'
import { safeExecFile } from '../lib/exec.js'
import { checkRuleDrift, checkContextDrift, type RuleDriftResult } from '../lib/drift.js'
import { findSecretsInLine, MAX_LINE_CHARS } from '../lib/scan-secrets.js'
import os from 'node:os'
import type { Runner } from '../lib/preflight.js'
import { runDiagnostics } from '../doctor/runner.js'
import { formatDiagnostics, formatDiagnosticsJson } from '../doctor/report.js'
import { diagNode } from '../doctor/diagnostics/node.js'
import { diagNpm } from '../doctor/diagnostics/npm.js'
import { diagPnpm } from '../doctor/diagnostics/pnpm.js'
import { diagGit } from '../doctor/diagnostics/git.js'
import { diagOs } from '../doctor/diagnostics/os.js'
import { buildVhkDiag } from '../doctor/diagnostics/vhk.js'
import { buildMcpDiag, mcpToolCount } from '../doctor/diagnostics/mcp.js'
import { buildAuditDiag } from '../doctor/diagnostics/audit.js'
import { findSkippedGoalFiles, listGoals } from '../lib/goal-frontmatter.js'
import { ECOSYSTEM_MDC_REL } from '../lib/inject-bootstrap.js'
import { agentsMdReferencesEcosystemMd } from './sync.js'
import { readSelectedPM } from '../doctor/pm.js'
import type { DiagDeps, DoctorOptions, DiagFn } from '../doctor/types.js'
// 업데이트 체크 함수는 version-check.ts 단일 소스로 이동(메뉴와 공용). 여기선 import + re-export
// (doctor.test.ts 의 `from doctor.js` import 경로 보존) + 내부 사용.
import { fetchLatestNpmVersion, compareSemver, recordLatest } from '../lib/version-check.js'
export { fetchLatestNpmVersion, compareSemver }

/**
 * Goal 84: doctor 통과 시 next-step — 신규/기존 레포 맥락 분기(D9).
 *   established: "이제 프로젝트를 시작하세요(vhk 시작)" 대신 이어서 작업(vhk work).
 *   new: 기존 온보딩 멘트 유지(퇴행 0 — Forbidden). 진단 항목 자체는 불변.
 */
export function selectDoctorOkNextStep(maturity: 'new' | 'established'): {
  message: string
  command: string
  cursorHint: string
} {
  if (maturity === 'established') {
    return {
      message: ko.doctor.nextEstablishedMessage,
      command: 'vhk work',
      cursorHint: ko.doctor.nextEstablishedCursor,
    }
  }
  return {
    message: ko.doctor.nextOkMessage,
    command: 'vhk 시작',
    cursorHint: '프로젝트 만들어줘',
  }
}

export interface CheckResult {
  name: string
  command: string
  version?: string
  ok: boolean
  hint: string
}

const MAX_DRIFT_LINE_DISPLAY_LENGTH = 240

/**
 * #552 최종 — doctor 출력 전용 deny-by-default 경계. 할당·PowerShell writer 구문을
 * 파싱하는 접근은 검수마다 새 구문(SetEnvironmentVariable·setx …)이 뚫어서 폐기했다.
 * 줄의 identifier/token 중 민감 키 계열이 '언급'되기만 하면 읽기/쓰기/placeholder
 * 구분 없이 줄 전체를 숨긴다. 단어는 소문자·영숫자 run 으로 자르고, "api key" 같은
 * 두 단어 표기는 인접 쌍 결합으로 잡는다(camel/snake/kebab/SCREAMING 동일 취급).
 * 이 경계는 모든 시크릿 형식을 보장하지 않는다 — 민감 키 언급 + 알려진 값
 * 패턴(scan-secrets) + URL userinfo 세 판정이 잡는 범위까지다.
 */
const SENSITIVE_KEY = /token|secret|password|passwd|pwd|apikey|accesskey|credential/

function mentionsSensitiveKey(line: string): boolean {
  const words = line.toLowerCase().match(/[a-z0-9]+/g) ?? []
  return words.some(
    (word, i) => SENSITIVE_KEY.test(word) || (i + 1 < words.length && SENSITIVE_KEY.test(word + words[i + 1])),
  )
}

const URL_SCHEME_CHAR = /[A-Za-z0-9+.-]/
const URL_ALPHA = /[A-Za-z]/

/**
 * URL userinfo 자격증명 — postgres://app:pw@host 처럼 스킴 무관하게 유출된다.
 * 프로토콜 목록 대신 `스킴://` 후보를 전부 URL parser 로 확인해
 * username/password 가 하나라도 있으면 숨긴다(키 이름과 무관 — 항상 자격증명).
 * 후보 추출은 정규식 `[A-Za-z0-9+.-]*:\/\/` 백트래킹이 구분자 없는 장문
 * 영숫자 줄에서 O(n²) 라(#552 성능 검수 실측) 선형 스캔으로 한다:
 * `://` 없으면 즉시 false, 있으면 공백/따옴표류로 토큰을 갈라 토큰당 1회만 파싱.
 */
function hasUrlCredentials(line: string): boolean {
  if (!line.includes('://')) return false
  for (const token of line.split(/[\s'"<>]+/)) {
    const sep = token.indexOf('://')
    if (sep <= 0 || sep + 3 >= token.length) continue
    // 스킴 시작점 — 구분자 왼쪽의 스킴 문자 run 을 되짚고, 알파벳 시작 규칙을 맞춘다.
    let start = sep
    while (start > 0 && URL_SCHEME_CHAR.test(token[start - 1])) start--
    while (start < sep && !URL_ALPHA.test(token[start])) start++
    if (start === sep) continue
    let url: URL
    try {
      url = new URL(token.slice(start))
    } catch {
      continue // URL 형태가 아니면 자격증명도 없다
    }
    if (url.username !== '' || url.password !== '') return true
  }
  return false
}

/**
 * #552: 드리프트 기대/실제 줄에 시크릿·토큰이 섞이면 원문 노출 자체가 유출이다.
 * 판정 3종 = 알려진 값 패턴(scan-secrets) + 민감 키 언급 + URL userinfo.
 * findSecretsInLine 만 스캐너 계약대로 MAX_LINE_CHARS(4000자) cap 을 유지하고
 * 커스텀 판정 2종은 전체 줄을 본다 — 표시는 앞 240자지만 판정 근거(URL 의 @ 등)가
 * 4000자 밖에 있어도 표시 구간의 원문 유출은 막아야 하기 때문.
 */
export function driftLineHasSecret(line: string | null, filePath: string): boolean {
  if (line === null || line.length === 0) return false
  return (
    findSecretsInLine(line.slice(0, MAX_LINE_CHARS), filePath, 1).length > 0 ||
    mentionsSensitiveKey(line) ||
    hasUrlCredentials(line)
  )
}

function displayDriftLine(line: string | null): string {
  if (line === null) return ko.doctor.driftMissingLine
  if (line.length === 0) return ko.doctor.driftEmptyLine

  const visible = line.replace(/[\u0000-\u001f\u007f-\u009f]/g, character => {
    if (character === '\t') return '\\t'
    if (character === '\n') return '\\n'
    if (character === '\r') return '\\r'
    return `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
  })
  return visible.length > MAX_DRIFT_LINE_DISPLAY_LENGTH
    ? `${visible.slice(0, MAX_DRIFT_LINE_DISPLAY_LENGTH - 1)}…`
    : visible
}

export function formatRuleDriftDetails(
  mismatched: RuleDriftResult[],
  fullDiff = false,
): string[] {
  const limitedFiles = mismatched
    .filter(result => result.fullDiffLimited)
    .map(result => result.path)
  const details: Array<{
    path: string
    difference?: NonNullable<RuleDriftResult['differences']>[number]
    missing: boolean
  }> = []
  for (const result of mismatched) {
    if (result.status === 'missing') {
      details.push({ path: result.path, missing: true })
      continue
    }
    for (const difference of result.differences ?? []) {
      details.push({ path: result.path, difference, missing: false })
    }
  }

  const selected = fullDiff ? details : details.slice(0, 1)
  if (selected.length === 0) return []

  const lines: string[] = []
  for (const detail of selected) {
    if (detail.missing) {
      lines.push(ko.doctor.driftExpected(detail.path, ko.doctor.driftGeneratedFile))
      lines.push(ko.doctor.driftActual(detail.path, ko.doctor.driftMissingFile))
      continue
    }
    if (!detail.difference) continue
    const location = `${detail.path}:${detail.difference.line}`
    // #552: 한쪽 줄만 패턴에 걸려도 다른쪽이 같은 시크릿의 잘린/회전된 변형일 수 있어
    // (diff 특성상 두 줄이 거의 동일) 쌍으로 함께 숨긴다 — 원문은 어떤 줄에도 반복 금지.
    const sensitive =
      driftLineHasSecret(detail.difference.expected, detail.path) ||
      driftLineHasSecret(detail.difference.actual, detail.path)
    if (sensitive) {
      // (줄 없음)/(빈 줄)은 내용이 없어 유출도 없다 — 고정 표식을 유지해 진단 정보 보존.
      const hidden = (line: string | null) =>
        line === null || line.length === 0
          ? displayDriftLine(line)
          : ko.doctor.driftSensitiveHidden
      lines.push(ko.doctor.driftExpected(location, hidden(detail.difference.expected)))
      lines.push(ko.doctor.driftActual(location, hidden(detail.difference.actual)))
      continue
    }
    lines.push(ko.doctor.driftExpected(location, displayDriftLine(detail.difference.expected)))
    lines.push(ko.doctor.driftActual(location, displayDriftLine(detail.difference.actual)))
  }
  if (fullDiff && limitedFiles.length > 0) {
    lines.push(ko.doctor.driftDiffLimited(limitedFiles.join(', ')))
  }
  lines.push(ko.doctor.driftAction)
  return lines
}

export function checkCommand(name: string, command: string, hint: string): CheckResult {
  const result = safeExecFile(command, ['--version'])
  if (!result.ok) return { name, command, ok: false, hint }
  const version = result.out.split('\n')[0]
  return { name, command, version, ok: true, hint }
}

function getVhkVersion(): string | undefined {
  const dir = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.join(dir, '../package.json'),
    path.join(dir, '../../package.json'),
  ]

  for (const pkgPath of candidates) {
    try {
      if (fs.existsSync(pkgPath)) {
        const pkg = readJsonFile<{ version?: string }>(pkgPath)
        return pkg.version
      }
    } catch {
      continue
    }
  }
  return undefined
}

export async function doctor(opts: DoctorOptions & { diff?: boolean } = {}) {
  // 읽기전용 진단 — HARD_STOP 으로 막지 않는다(가드 docstring: '제외: 읽기전용(status 등)').
  // 오히려 HARD_STOP 켜진 순간이 환경 진단이 가장 필관리자 때.
  const cwd = process.cwd()

  // 환경 진단 — doctor 엔진(throw 격리, 진단만). Node 판정은 Goal 29 nodeMeetsShimSafe 재사용.
  const run: Runner = (cmd, args) => {
    const r = safeExecFile(cmd, args)
    return r.ok ? { ok: true, out: r.out } : { ok: false, out: r.out, err: r.err }
  }
  const deps: DiagDeps = {
    run,
    nodeVersion: process.version,
    platform: process.platform,
    osRelease: os.release(),
    selectedPM: readSelectedPM(process.cwd()), // #175 — 미사용 PM 부재를 fail 로 올리지 않게
  }
  // Phase 2: VHK 설치/업데이트 · MCP 서버 무결성 · 의존성 audit(--audit 시) 추가.
  const auditPm = fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))
    ? 'pnpm'
    : fs.existsSync(path.join(cwd, 'yarn.lock'))
      ? 'yarn'
      : 'npm'
  const diagnostics: DiagFn[] = [
    diagNode, diagNpm, diagPnpm, diagGit, diagOs,
    () => {
      const version = getVhkVersion()
      const latest = version ? (fetchLatestNpmVersion('@byh3071/vhk') ?? null) : null
      if (latest) recordLatest(latest) // 메뉴(getUpdateInfo) 캐시 적재
      return buildVhkDiag({ version, latest })
    },
    async () => buildMcpDiag(await mcpToolCount()),
    (o) => buildAuditDiag(o, () => run(auditPm, ['audit'])),
  ]
  const diags = await runDiagnostics(diagnostics, opts, deps)

  // --json: 기계가독 출력만(제목·프로젝트파일·드리프트 생략) — Phase 2.
  if (opts.json) {
    console.log(formatDiagnosticsJson(diags))
    return
  }

  console.log(chalk.bold(`\n${ko.doctor.title}\n`))
  for (const line of formatDiagnostics(diags)) console.log(line)
  const anyFail = diags.some((d) => d.status === 'fail')
  const warnCount = diags.filter((d) => d.status === 'warn').length

  console.log('')
  console.log(chalk.bold(`  ${ko.doctor.projectFiles}`))

  const projectFiles = [
    { name: 'RULES.md', hint: 'vhk init으로 생성 가능' },
    { name: 'COMMANDS.md', hint: 'vhk init으로 생성 가능' },
    { name: 'package.json', hint: '프로젝트 폴더에서 실행하세요' },
    { name: '.gitignore', hint: '보안을 위해 추가 권장' },
    { name: '.env', hint: '.gitignore에 포함되어 있는지 확인' },
  ]

  for (const file of projectFiles) {
    const exists = fs.existsSync(path.join(cwd, file.name))
    if (exists) {
      console.log(chalk.green(`    ✅ ${file.name}`))
      if (file.name === '.env') {
        const gitignorePath = path.join(cwd, '.gitignore')
        if (fs.existsSync(gitignorePath)) {
          const gitignore = fs.readFileSync(gitignorePath, 'utf-8')
          if (!gitignore.includes('.env')) {
            console.log(chalk.yellow(`    ${ko.doctor.envNotIgnored}`))
          }
        }
      }
    } else if (file.name === '.env' && fs.existsSync(path.join(cwd, '.env.local'))) {
      // VHK-009: .env 없어도 .env.local 있으면 정상(Vite 관례) — 모호한 부재 안내 대신 인식.
      console.log(chalk.green('    ✅ .env.local') + chalk.dim(' — 로컬 env 사용 중 (.env 없어도 정상)'))
    } else {
      console.log(chalk.dim(`    ⚫ ${file.name}`) + chalk.dim(` — ${file.hint}`))
    }
  }

  // 드리프트 점검 (passive — doctor 안에서 자동 경고, 읽기 전용)
  console.log('')
  console.log(chalk.bold(`  ${ko.doctor.driftTitle}`))
  const ruleDrift = checkRuleDrift(cwd, { fullDiff: opts.diff === true })
  // --strict 게이트용 — 규칙 드리프트 발생 여부만 추적(context 드리프트는 제외: 생성물이라 비차단).
  let ruleDrifted = false
  if (!ruleDrift.checked) {
    console.log(chalk.dim(`    ${ko.doctor.driftNoRules}`))
  } else {
    const mismatched = ruleDrift.results.filter(r => r.status !== 'ok')
    if (mismatched.length === 0) {
      console.log(chalk.green(`    ${ko.doctor.driftRuleClean}`))
    } else {
      console.log(chalk.yellow(`    ${ko.doctor.driftRuleWarn(mismatched.map(d => d.path).join(', '))}`))
      for (const line of formatRuleDriftDetails(mismatched, opts.diff === true)) {
        console.log(chalk.dim(`      ${line}`))
      }
      ruleDrifted = true
    }
  }
  const ctxDrift = checkContextDrift(cwd)
  if (ctxDrift.checked && ctxDrift.stale) {
    console.log(chalk.yellow(`    ${ko.doctor.driftContextWarn}`))
  }

  // Goal frontmatter — silent skip 감지 (#465)
  let goalSchemaWarn = false
  let ecosystemMdcWarn = false
  const goalsDir = path.join(cwd, 'goals')
  if (fs.existsSync(goalsDir)) {
    console.log('')
    console.log(chalk.bold(`  ${ko.doctor.goalSchemaTitle}`))
    const parsed = listGoals(goalsDir)
    const skipped = findSkippedGoalFiles(goalsDir)
    let mdCount = 0
    try {
      mdCount = fs.readdirSync(goalsDir).filter((n) => n.endsWith('.md') && n !== '_meta.md').length
    } catch {
      mdCount = 0
    }
    if (skipped.length > 0) {
      goalSchemaWarn = true
      console.log(chalk.yellow(`    ${ko.doctor.goalSchemaSkipped(skipped.length)}`))
      for (const s of skipped.slice(0, 5)) {
        console.log(chalk.yellow(`      - goals/${s.file}: ${s.reason}`))
      }
      if (skipped.length > 5) console.log(chalk.dim(`      … 외 ${skipped.length - 5}건`))
      console.log(chalk.dim('    → vhk goal migrate [--dry-run]'))
    } else if (mdCount > 0 && parsed.length === 0) {
      goalSchemaWarn = true
      console.log(chalk.yellow(`    ${ko.doctor.goalSchemaEmpty(mdCount)}`))
      console.log(chalk.dim('    → vhk goal migrate [--dry-run]'))
    } else {
      console.log(chalk.green(`    ${ko.doctor.goalSchemaOk(parsed.length)}`))
    }
  }

  const agentsPath = path.join(cwd, 'AGENTS.md')
  const ecoPath = path.join(cwd, ECOSYSTEM_MDC_REL)
  if (fs.existsSync(agentsPath)) {
    const agentsContent = fs.readFileSync(agentsPath, 'utf-8')
    if (agentsMdReferencesEcosystemMd(agentsContent) && !fs.existsSync(ecoPath)) {
      ecosystemMdcWarn = true
      console.log('')
      console.log(chalk.bold(`  ${ko.doctor.ecosystemMdcTitle}`))
      console.log(chalk.yellow(`    ${ko.doctor.ecosystemMdcMissing}`))
      console.log(chalk.dim('    → vhk inject-bootstrap 또는 vhk sync'))
    }
  }

  console.log('')
  if (anyFail) {
    // 치명(fail) — 도구 부재 등. exit 1.
    console.log(chalk.yellow.bold(`  ${ko.doctor.missing} ${ko.doctor.missingHint}`))
    printNextStep({
      message: ko.doctor.nextRetryMessage,
      command: 'vhk doctor',
      cursorHint: '환경 다시 점검해줘',
    })
    process.exitCode = 1
  } else if (warnCount > 0) {
    // 경고(warn) — '준비 완료' 로 묻지 않고 권장 조치를 안내. exit 0 유지(권고).
    console.log(chalk.yellow.bold(`  ${ko.doctor.warnSummary(warnCount)}`))
    printNextStep({
      message: '위 권장 조치 확인 (필수는 아님).',
      command: 'vhk doctor',
      cursorHint: '환경 다시 점검해줘',
    })
  } else {
    console.log(chalk.green.bold(`  ${ko.doctor.allOk}`))
    // Goal 84: 활성(기존) 레포면 "프로젝트를 시작하세요" 대신 맥락 맞는 다음 행동(D9).
    printNextStep(selectDoctorOkNextStep(projectMaturity(cwd)))
  }

  // SoT(3층) CI 게이트: --strict 면 규칙 드리프트를 실패로 승격(exit 1). 기본 호출은 경고만 유지.
  if (opts.strict && ruleDrifted) {
    console.log('')
    console.log(chalk.red.bold('  ❌ --strict: 규칙 드리프트 발견 → 실패 처리 (vhk sync 로 동기화 후 다시 실행)'))
    process.exitCode = 1
  }
  if (opts.strict && goalSchemaWarn) {
    console.log('')
    console.log(chalk.red.bold('  ❌ --strict: goal frontmatter 스키마 경고 → 실패 처리 (vhk goal migrate)'))
    process.exitCode = 1
  }
  if (opts.strict && ecosystemMdcWarn) {
    console.log('')
    console.log(chalk.red.bold('  ❌ --strict: ecosystem.mdc 누락 → 실패 처리 (vhk inject-bootstrap)'))
    process.exitCode = 1
  }
}
