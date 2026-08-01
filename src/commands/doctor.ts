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
 * #552 독립 검수 보강 — doctor 출력 '전용' 보수 판정. 전체 스캐너(scan-secrets)의
 * 오탐 정책은 저장소 스캔용이라 건드리지 않는다. 스캐너가 놓치는 두 우회:
 *   1) TOKEN=<값> 처럼 접미사 없는 키 — generic-api-key 는 api_key/access_token 류만 매칭.
 *   2) 주석/헤딩 줄의 api_key=live_fake_… — 값 '내부'의 fake_ 부분문자열만으로
 *      PLACEHOLDER_MARKER 완화가 발동해 원문이 그대로 출력.
 * 여기선 token/secret/password/api-key/access-token 류 할당을 넓게 잡되,
 * 값 '전체'가 명백한 placeholder일 때만 통과시킨다(부분문자열 불허).
 */
const SENSITIVE_ASSIGNMENT =
  /(?:^|[^A-Za-z0-9])(?:[A-Za-z0-9]+[_-])*(?:token|secret|password|passwd|pwd|api[_-]?key|apikey|credential)s?\s*[:=]\s*['"]?([^\s'"]{8,})/gi

const PLACEHOLDER_WORDS = new Set([
  'your', 'my', 'sample', 'example', 'fake', 'dummy', 'placeholder', 'changeme',
  'replace', 'me', 'redacted', 'todo', 'tbd', 'insert', 'here', 'goes', 'value',
  'key', 'token', 'secret', 'password', 'api', 'access', 'apikey', 'id',
])

/** 값 전체가 명백한 placeholder일 때만 true — 실제 값 내부의 fake/example 부분문자열은 불허. */
function isObviousPlaceholderValue(value: string): boolean {
  if (/^<[^<>]+>$/.test(value)) return true // <YOUR_TOKEN>
  if (/^\$(?:\{[^}]+\}|[A-Za-z_][A-Za-z0-9_]*)$/.test(value)) return true // ${VAR}·$VAR
  if (/^(?:[A-Za-z0-9]+[_-])?(?:x{4,}|\*{3,}|\.{3,})$/i.test(value)) return true // ghp_xxxx…
  // 모든 구획이 placeholder 단어(또는 x 반복)여야 통과 — live_fake_… 처럼 하나라도 실값이면 숨김.
  return value
    .split(/[_-]/)
    .every((segment) => PLACEHOLDER_WORDS.has(segment.toLowerCase()) || /^x+$/i.test(segment))
}

function hasSensitiveAssignment(line: string): boolean {
  for (const match of line.matchAll(SENSITIVE_ASSIGNMENT)) {
    if (!isObviousPlaceholderValue(match[1])) return true
  }
  return false
}

/**
 * #552: 드리프트 기대/실제 줄에 시크릿·토큰이 섞이면 원문 노출 자체가 유출이다.
 * findSecretsInLine 은 MAX_LINE_CHARS(4000자) 초과 줄을 조용히 건너뛰는데, 표시는
 * 앞 240자를 여전히 보여주므로 검사 대상을 slice 로 한도 안에 맞춰 표시 영역이
 * 반드시 검사되게 한다. relPath 를 넘겨 주석/env 템플릿의 placeholder 완화(오탐 방지)는 유지.
 */
export function driftLineHasSecret(line: string | null, filePath: string): boolean {
  if (line === null || line.length === 0) return false
  const target = line.slice(0, MAX_LINE_CHARS)
  return findSecretsInLine(target, filePath, 1).length > 0 || hasSensitiveAssignment(target)
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
