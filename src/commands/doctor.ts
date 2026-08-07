import chalk from 'chalk'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { printNextStep } from '../lib/next-step.js'
import { ko } from '../i18n/ko.js'
import { projectMaturity } from '../lib/project-maturity.js'
import { readJsonFile } from '../lib/read-json.js'
import { safeExecFile } from '../lib/exec.js'
import { checkRuleDrift, checkContextDrift, checkNextTaskFreshness, type RuleDriftResult } from '../lib/drift.js'
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
import { analyzeGoalDependencies, type GoalDependencyIssue } from '../lib/goal-dependencies.js'
import { ECOSYSTEM_MDC_REL } from '../lib/inject-bootstrap.js'
import { agentsMdReferencesEcosystemMd } from './sync.js'
import { readSelectedPM } from '../doctor/pm.js'
import { formatUnstartedGoalLines, summarizeUnstartedGoals } from './status.js'
import type { DiagDeps, DoctorOptions, DiagFn } from '../doctor/types.js'
// 업데이트 체크 함수는 version-check.ts 단일 소스로 이동(메뉴와 공용). 여기선 import + re-export
// (doctor.test.ts 의 `from doctor.js` import 경로 보존) + 내부 사용.
import { fetchLatestNpmVersion, compareSemver, recordLatest } from '../lib/version-check.js'
export { fetchLatestNpmVersion, compareSemver }

function goalDependencyIssueText(issue: GoalDependencyIssue): string {
  switch (issue.kind) {
    case 'invalid':
      return ko.goal.dependencyInvalid(issue.goalId, issue.invalidTokens.map((token) => token || '(빈 값)').join(', '))
    case 'missing':
      return ko.goal.dependencyMissing(issue.goalId, issue.dependencyId)
    case 'self':
      return ko.goal.dependencySelf(issue.goalId)
    case 'cycle':
      return ko.goal.dependencyCycle(issue.cycle.join(' → '))
  }
}

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
 * 줄의 identifier 에 민감 키 계열이 '언급'되기만 하면 읽기/쓰기/placeholder 구분
 * 없이 줄 전체를 숨긴다. 단, 경계 없는 substring 은 tokenizerMode·maxTokens·
 * passwordlessLogin·apiKeyboardShortcut 까지 숨기는 과차단(검수 Medium)이라,
 * identifier 를 구분자·camel/약어/숫자 경계로 분해한 '정확한 segment' 로 판정한다:
 *   - 어느 위치든 민감: secret/password/passwd/pwd/credential(+joined apikey·
 *     accesskey·accesstoken) 및 그 명백한 복수형(secrets·apiKeys·credentials …,
 *     검수 High — 복수형이 단수 exact 를 비껴 원문 노출) — credentialStore 처럼
 *     수식어 자리여도 내용물이 시크릿.
 *   - token 은 '같은 identifier 안'에서만 측정 메타로 완화된다. identifier =
 *     영숫자·_·- 의 연속(camel/snake/kebab/SCREAMING 을 한 단위로) — 그 안에서
 *     token 다음 segment 가 count/budget/usage/limit … 이면 안전(tokenCount·
 *     TOKEN_LIMIT), 그 외 접미사(value/file/env)나 identifier 끝이면 민감.
 *     완화를 identifier 밖(할당·공백·인용 너머)으로 새게 하면 TOKEN=limit-… 의
 *     '값 첫 segment' 가 안전 메타를 오인 충족해 원문이 노출된다(검수 High).
 *   - 복수형 tokens 는 반대 방향: 같은 identifier 의 직전 segment 가 정확히
 *     max 일 때(maxTokens/max_tokens/MAX_TOKENS — LLM 설정 관용구)만 허용,
 *     그 외(TOKENS 단독·accessTokens·authTokens·refreshTokens …)는 전부 민감.
 *   - 인접 segment 쌍 api+key(s)/access+key(s) 는 identifier 경계를 넘어 판정
 *     ("API key"·api_key·apiKey) — 최소 상태(직전 segment)만 유지.
 * 이 경계는 모든 시크릿 형식을 보장하지 않는다 — 민감 키 언급 + 알려진 값
 * 패턴(scan-secrets) + URL userinfo 세 판정이 잡는 범위까지다.
 */
const SENSITIVE_ANYWHERE = new Set([
  'secret', 'password', 'passwd', 'pwd', 'credential', 'apikey', 'accesskey', 'accesstoken',
  'secrets', 'passwords', 'passwds', 'pwds', 'credentials', 'apikeys', 'accesskeys', 'accesstokens',
])
const SENSITIVE_PAIRS = new Set(['apikey', 'accesskey', 'apikeys', 'accesskeys'])
// token 뒤에 와도 안전한 측정 메타만 명시 — 나머지(모르는 segment 포함)는 deny.
const SAFE_AFTER_TOKEN = new Set([
  'count', 'counts', 'budget', 'budgets', 'usage', 'usages', 'limit', 'limits',
  'length', 'size', 'type', 'kind', 'status', 'metrics',
])

/** identifier(영숫자·_·-)를 구분자·camel/약어/숫자 경계로 분해해 소문자 segment 로 (선형). */
function identifierSegments(identifier: string): string[] {
  return identifier
    .replace(/([a-z])([A-Z])/g, '$1 $2') // fooBar → foo Bar
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2') // APIKey → API Key
    .replace(/([A-Za-z])([0-9])/g, '$1 $2') // oauth2 → oauth 2
    .replace(/([0-9])([A-Za-z])/g, '$1 $2') // 2fa → 2 fa
    .replace(/[_-]+/g, ' ') // snake/kebab → 같은 identifier 내부 경계
    .toLowerCase()
    .split(' ')
    .filter((segment) => segment !== '')
}

function mentionsSensitiveKey(line: string): boolean {
  // O(1) 상태 선형 순회 — previous(인접 쌍)는 identifier 를 넘어, pending 은 안에서만.
  let previous = ''
  for (const identifier of line.match(/[A-Za-z0-9_-]+/g) ?? []) {
    let pendingToken = false
    let previousInIdentifier = ''
    for (const segment of identifierSegments(identifier)) {
      if (SENSITIVE_ANYWHERE.has(segment)) return true
      if (previous !== '' && SENSITIVE_PAIRS.has(previous + segment)) return true
      // 복수형 tokens 는 같은 identifier 에서 max 접두일 때만 허용(maxTokens 관용구).
      if (segment === 'tokens' && previousInIdentifier !== 'max') return true
      if (pendingToken) {
        if (!SAFE_AFTER_TOKEN.has(segment)) return true
        pendingToken = false
      }
      if (segment === 'token') pendingToken = true
      previous = segment
      previousInIdentifier = segment
    }
    // identifier 가 token 으로 끝나면(TOKEN=…·$env:NPM_TOKEN·TOKEN 단독) 민감 —
    // 할당/공백/인용 너머의 값은 완화 근거가 될 수 없다.
    if (pendingToken) return true
  }
  return false
}

const URL_SCHEME_CHAR = /[A-Za-z0-9+.-]/
const URL_ALPHA = /[A-Za-z]/

/** bounded 후보를 실제 URL 로 확인 — 파싱 불가면 자격증명도 없다. */
function urlHasUserinfo(candidate: string): boolean {
  try {
    const url = new URL(candidate)
    return url.username !== '' || url.password !== ''
  } catch {
    return false
  }
}

/**
 * URL userinfo 자격증명 — postgres://app:pw@host 처럼 스킴 무관하게 유출된다.
 * 프로토콜 목록 대신 `스킴://` 후보를 전부 URL parser 로 확인해
 * username/password 가 하나라도 있으면 숨긴다(키 이름과 무관 — 항상 자격증명).
 * 후보 추출은 선형 유지(#552 성능 검수 — 정규식 백트래킹 O(n²) 회피): token 안
 * 모든 `://` 를 왼쪽부터 순회하되, userinfo(@)는 정의상 authority(`://` 뒤 첫
 * /?# 전)에만 있으므로 그 bounded 구간만 검사한다 — 쉼표/세미콜론/query 로
 * 이어붙은 두 번째 URL 도 놓치지 않는다. 스킴 되짚기는 이전 `://` 를(스킴 문자에
 * / · : 없음), authority 훑기는 다음 `://` 를 넘지 못해 전체 작업량이 선형이다.
 */
function hasUrlCredentials(line: string): boolean {
  if (!line.includes('://')) return false
  for (const token of line.split(/[\s'"<>]+/)) {
    for (let sep = token.indexOf('://'); sep !== -1; sep = token.indexOf('://', sep + 3)) {
      if (sep === 0) continue
      // 스킴 시작점 — 구분자 왼쪽의 스킴 문자 run 을 되짚고, 알파벳 시작 규칙을 맞춘다.
      let start = sep
      while (start > 0 && URL_SCHEME_CHAR.test(token[start - 1])) start--
      while (start < sep && !URL_ALPHA.test(token[start])) start++
      if (start === sep) continue
      let end = sep + 3
      while (end < token.length && !'/?#'.includes(token[end])) end++
      if (end === sep + 3 || !token.slice(sep + 3, end).includes('@')) continue
      if (urlHasUserinfo(token.slice(start, end))) return true
    }
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

  // C0/C1 제어문자에 더해 양방향(bidi)·제로폭·줄 구분 문자도 이스케이프한다(#552).
  // 이 문자들은 터미널에서 줄 내용을 시각적으로 뒤집거나 지우거나 쪼갤 수 있다 —
  // 드리프트 대상 파일은 사람이 손으로 고칠 수 있어 출력 위조 여지를 남기지 않는다.
  const CONTROL_OR_SPOOFING = new RegExp(
    '[' +
      '\u0000-\u001f\u007f-\u009f' + // C0/C1
      '\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069' + // 양방향 제어
      '\u200b-\u200d\ufeff' + // 제로폭
      '\u2028\u2029' + // 줄·문단 구분
      ']',
    'g',
  )
  const visible = line.replace(CONTROL_OR_SPOOFING, character => {
    if (character === '\t') return '\\t'
    if (character === '\n') return '\\n'
    if (character === '\r') return '\\r'
    return `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
  })
  return visible.length > MAX_DRIFT_LINE_DISPLAY_LENGTH
    ? `${visible.slice(0, MAX_DRIFT_LINE_DISPLAY_LENGTH - 1)}…`
    : visible
}

/**
 * `--strict` 실패로 승격할 규칙 드리프트인가 (#552).
 * 내용 불일치(`drifted`)뿐 아니라 **생성 파일 누락(`missing`)도 드리프트**다 —
 * 규칙이 실제로 동기화돼 있지 않다는 뜻이라 CI 게이트에서 통과시키지 않는다.
 * (README·COMMANDS.md·`--strict` 옵션 설명도 이 의미로 적혀 있다.)
 */
export function isRuleDriftFailure(status: RuleDriftResult['status']): boolean {
  return status !== 'ok'
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
    const mismatched = ruleDrift.results.filter(r => isRuleDriftFailure(r.status))
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
    console.log(chalk.dim(`       ${ko.doctor.driftContextAction}`))
  }
  const nextTaskFreshness = checkNextTaskFreshness(cwd)
  if (nextTaskFreshness.checked && nextTaskFreshness.stale) {
    console.log(chalk.yellow(`    ${ko.doctor.driftNextTaskWarn}`))
    console.log(chalk.dim(`       ${ko.doctor.driftNextTaskAction}`))
  }

  // Goal frontmatter — silent skip 감지 (#465)
  let goalSchemaWarn = false
  let goalDependencyWarn = false
  let ecosystemMdcWarn = false
  const goalsDir = path.join(cwd, 'goals')
  if (fs.existsSync(goalsDir)) {
    console.log('')
    console.log(chalk.bold(`  ${ko.doctor.goalSchemaTitle}`))
    const parsed = listGoals(goalsDir)
    const skipped = findSkippedGoalFiles(goalsDir)
    const dependencyAnalysis = analyzeGoalDependencies(parsed)
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
    if (dependencyAnalysis.issues.length > 0) {
      goalDependencyWarn = true
      console.log(chalk.yellow(`    ${ko.goal.dependencyIssueHeader(dependencyAnalysis.issues.length)}`))
      for (const issue of dependencyAnalysis.issues.slice(0, 5)) {
        console.log(chalk.yellow(`      - ${goalDependencyIssueText(issue)}`))
      }
      if (dependencyAnalysis.issues.length > 5) {
        console.log(chalk.dim(`      … 외 ${dependencyAnalysis.issues.length - 5}건`))
      }
      console.log(chalk.dim(`    → ${ko.goal.dependencyFixHint}`))
    }
    if (dependencyAnalysis.invalidInProgress.length > 0) {
      goalDependencyWarn = true
      for (const item of dependencyAnalysis.invalidInProgress.slice(0, 10)) {
        console.log(chalk.yellow(`    ${ko.goal.dependencyInvalidInProgress(item.goalId, item.waitingFor.join(', '))}`))
      }
      if (dependencyAnalysis.invalidInProgress.length > 10) {
        console.log(chalk.dim(`      … 외 ${dependencyAnalysis.invalidInProgress.length - 10}건`))
      }
    }
    const waitingGoals = parsed.filter((goal) => {
      const id = goal.frontmatter.id
      return typeof id === 'number' && (dependencyAnalysis.waiting.get(id)?.length ?? 0) > 0
    })
    for (const goal of waitingGoals.slice(0, 10)) {
      const id = goal.frontmatter.id
      if (typeof id !== 'number') continue
      const waitingFor = dependencyAnalysis.waiting.get(id) ?? []
      console.log(chalk.dim(`    Goal ${id} — ${ko.goal.dependencyWaiting(waitingFor.join(', '))}`))
    }
    if (waitingGoals.length > 10) {
      console.log(chalk.dim(`      … 외 ${waitingGoals.length - 10}건`))
    }
    const unstarted = summarizeUnstartedGoals(parsed)
    const unstartedLines = formatUnstartedGoalLines(unstarted)
    const unstartedColor = unstarted.count > 0 ? chalk.yellow : chalk.green
    console.log(unstartedColor(`    🕰️ ${unstartedLines[0]}`))
    for (const line of unstartedLines.slice(1)) console.log(unstartedColor(`       ${line}`))
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
  if (opts.strict && goalDependencyWarn) {
    console.log('')
    console.log(chalk.red.bold('  ❌ --strict: goal 선행 작업 설정 오류 → 실패 처리'))
    console.log(chalk.dim(`     ${ko.goal.dependencyFixHint}`))
    process.exitCode = 1
  }
  if (opts.strict && ecosystemMdcWarn) {
    console.log('')
    console.log(chalk.red.bold('  ❌ --strict: ecosystem.mdc 누락 → 실패 처리 (vhk inject-bootstrap)'))
    process.exitCode = 1
  }
}
