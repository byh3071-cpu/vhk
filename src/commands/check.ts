import chalk from 'chalk'
import path from 'node:path'
import fs from 'node:fs'
import { parseRules, type Rule, type RuleViolation } from '../lib/rules-parser.js'
import { ko } from '../i18n/ko.js'
import { log } from '../utils/logger.js'
import { printNextStep } from '../lib/next-step.js'
import { goalCheck } from './goal.js'
import { appendCheckLog, buildCheckLogEntry } from '../lib/check-log.js'

export interface CheckOptions {
  goal?: string
  /** #374: JSON 요약 출력(CI/MCP용) — evolveList/evolveSuggest --json 컨벤션 재사용. */
  json?: boolean
}

export interface CheckSummary {
  totalRules: number
  passCount: number
  violations: RuleViolation[]
  errors: number
  warnings: number
}

/**
 * 규칙별 위반 계산 — 콘솔 출력과 분리된 계산부(#374: checkRules 콘솔 렌더/--json/check-log 가
 * 이 결과를 공유해 `rule.check(cwd)` 를 중복 호출하지 않는다). fs 읽기는 있지만(rule.check 내부)
 * 콘솔 출력은 0.
 */
export function computeCheckSummary(rules: Rule[], cwd: string): CheckSummary {
  const allViolations: RuleViolation[] = []
  let passCount = 0
  for (const rule of rules) {
    const violations = rule.check(cwd)
    if (violations.length === 0) passCount++
    else allViolations.push(...violations)
  }
  const errors = allViolations.filter(v => v.severity === 'error').length
  const warnings = allViolations.filter(v => v.severity === 'warning').length
  return { totalRules: rules.length, passCount, violations: allViolations, errors, warnings }
}

export async function check(opts: CheckOptions = {}, target?: string) {
  // #405: `vhk check <target>` 위치인자 처리 — 'evals'(골든셋 채점기, 미구현) 등 미인식 서브명령이
  // RULES.md 규칙점검으로 조용히 빠지던(silent fallback) 동작을 막고 명시적으로 안내한다.
  const sub = target?.trim()
  if (sub) {
    return checkSubcommand(sub)
  }
  // --goal <id> 지정 시 goal-aware 게이트로 우회 (RULES.md 점검 대신).
  if (opts.goal !== undefined) {
    return goalCheck({ id: opts.goal })
  }
  return checkRules(opts)
}

/**
 * #405: `vhk check <target>` 의 서브명령 안내. silent fallback 금지.
 *  - 'evals' = 골든셋 채점기용 예약어(본체 미구현, 로드맵 goal G-B) → 정보성 안내(exit 0).
 *  - 그 외   = 알 수 없는 인자 → 정직한 안내 + exit 1(#346: 조용한 성공 위장 차단).
 */
function checkSubcommand(sub: string) {
  if (sub === 'evals') {
    log.plain('')
    log.bold(ko.check.evalsTitle)
    log.dim(`  ${ko.check.evalsHint}`)
    printNextStep({
      message: '지금은 인자 없는 `vhk check` 가 RULES.md 규칙을 점검해요.',
      command: 'vhk check',
      cursorHint: '규칙 점검 돌려줘',
    })
    return
  }
  log.plain('')
  log.warn(ko.check.unknownTarget(sub))
  log.dim(`  ${ko.check.unknownHint}`)
  log.plain('')
  process.exitCode = 1
}

async function checkRules(opts: CheckOptions = {}) {
  const cwd = process.cwd()
  const rulesPath = path.join(cwd, 'RULES.md')

  if (!fs.existsSync(rulesPath)) {
    if (opts.json) {
      console.log(JSON.stringify({ error: 'no-rules' }, null, 2))
      process.exitCode = 1
      return
    }
    console.log(chalk.bold(`\n${ko.check.title}\n`))
    console.log(chalk.yellow(ko.check.noRules))
    console.log(chalk.dim('  vhk init으로 시작하거나 RULES.md를 만들어 보세요.'))
    return
  }

  const rules = parseRules(rulesPath)

  if (rules.length === 0) {
    if (opts.json) {
      console.log(JSON.stringify({ totalRules: 0, passCount: 0, violations: [], errors: 0, warnings: 0 }, null, 2))
      return
    }
    console.log(chalk.bold(`\n${ko.check.title}\n`))
    // VHK-011: '검증 가능한' = 코드로 자동 검사되는 일부만. 나머지(any 금지·빈 catch 등)는 수동 확인.
    console.log(chalk.dim(`  📏 자동 검증 가능한 규칙 0개 감지 (나머지 규칙은 수동/도구 확인)\n`))
    console.log(chalk.yellow(ko.check.noAutoRules))
    console.log(chalk.dim('  RULES.md에 파일 이름·폴더 규칙을 적으면 자동으로 점검해요.'))
    return
  }

  // #374: 콘솔 렌더와 분리된 계산부 — rule.check(cwd) 중복 호출 없이 --json/check-log 가 공유.
  const summary = computeCheckSummary(rules, cwd)

  // #374: 실행마다 위반 총계 스냅샷 append(evolve 효과측정 토대) — best-effort, 판정을 막지 않음.
  try {
    appendCheckLog(cwd, buildCheckLogEntry(summary, new Date().toISOString()))
  } catch {
    /* 원장 append 실패 비치명 — check 본 판정은 이미 계산됨 */
  }

  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2))
    if (summary.errors > 0) process.exitCode = 1
    return
  }

  console.log(chalk.bold(`\n${ko.check.title}\n`))
  console.log(chalk.dim(`  📏 자동 검증 가능한 규칙 ${rules.length}개 감지 (나머지 규칙은 수동/도구 확인)\n`))

  const violationsByRule = new Map<string, RuleViolation[]>()
  for (const v of summary.violations) {
    const arr = violationsByRule.get(v.ruleId) ?? []
    arr.push(v)
    violationsByRule.set(v.ruleId, arr)
  }

  for (const rule of rules) {
    const violations = violationsByRule.get(rule.id) ?? []
    if (violations.length === 0) {
      // VHK-013: content(금지/필수) 규칙은 description 60자 컷에 가려진 '실제 검사 패턴'을 함께 표기.
      const patternHint = rule.type === 'content' && rule.pattern ? chalk.dim(` [검사: ${rule.pattern.source}]`) : ''
      console.log(chalk.green(`  ✅ ${rule.id}`) + chalk.dim(` — ${rule.description.slice(0, 60)}`) + patternHint)
    } else {
      console.log(chalk.red(`  ❌ ${rule.id}`) + chalk.dim(` — ${violations.length}건 위반`))
      violations.forEach(v => {
        const loc = v.file ? chalk.dim(` (${v.file}${v.line ? ':' + v.line : ''})`) : ''
        const icon = v.severity === 'error' ? chalk.red('✖')
          : v.severity === 'warning' ? chalk.yellow('⚠')
          : chalk.blue('ℹ')
        console.log(`    ${icon} ${v.message}${loc}`)
      })
    }
  }

  console.log('')

  if (summary.violations.length === 0) {
    // VHK-011: "모든 규칙 통과" 거짓안심 금지 — 자동 검증된 부분만 통과라고 명시.
    console.log(chalk.green.bold(`✅ 자동 검증 가능한 규칙 ${summary.passCount}개 통과`))
    console.log(chalk.dim('   (RULES.md 의 나머지 규칙은 코드 자동 검사 불가 — 직접/도구로 확인하세요.)'))
    printNextStep({
      message: '모든 규칙 통과! 보안 스캔도 해볼까요?',
      command: 'vhk 보안 scan',
      cursorHint: '보안 스캔 돌려줘',
    })
  } else {
    console.log(chalk.bold(ko.check.summary))
    console.log(`  규칙: ${chalk.cyan(String(rules.length))}개 | 통과: ${chalk.green(String(summary.passCount))}개 | 위반: ${chalk.red(String(summary.violations.length))}건`)
    if (summary.errors > 0) console.log(`  ${chalk.red(`✖ ${summary.errors}개 에러`)}`)
    if (summary.warnings > 0) console.log(`  ${chalk.yellow(`⚠ ${summary.warnings}개 경고`)}`)
    printNextStep({
      message: '위반 항목을 수정한 후 다시 점검하세요.',
      command: 'vhk 점검',
      cursorHint: '위반 항목 수정해줘',
    })
  }

  if (summary.errors > 0) {
    process.exitCode = 1
  }
}
