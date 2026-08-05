import chalk from 'chalk'
import path from 'node:path'
import fs from 'node:fs'
import {
  parseRuleDeclarations,
  parseRules,
  type Rule,
  type RuleDeclaration,
  type RuleViolation,
} from '../lib/rules-parser.js'
import { ko } from '../i18n/ko.js'
import { log } from '../utils/logger.js'
import { printNextStep } from '../lib/next-step.js'
import { findRuleCheckScript, goalCheck, runCheckScript } from './goal.js'
import { appendCheckLog, buildCheckLogEntry } from '../lib/check-log.js'
import { countFillSlots } from '../lib/install-receipt.js'

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
  declaredRules: number
  checkedRules: number
  uncheckedRules: number
  coveragePercent: number
}

interface CoreCheckSummary {
  totalRules: number
  passCount: number
  violations: RuleViolation[]
  errors: number
  warnings: number
}

export interface RuleBindingResult {
  declaration: RuleDeclaration
  scriptPath?: string
  violations: RuleViolation[]
}

/**
 * 규칙별 위반 계산 — 콘솔 출력과 분리된 계산부(#374: checkRules 콘솔 렌더/--json/check-log 가
 * 이 결과를 공유해 `rule.check(cwd)` 를 중복 호출하지 않는다). fs 읽기는 있지만(rule.check 내부)
 * 콘솔 출력은 0.
 */
export function computeCheckSummary(rules: Rule[], cwd: string): CoreCheckSummary {
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

/** 연결 검사 파일을 찾아 실행한다. 잘못된 표시와 누락 파일도 명시적인 오류로 바꾼다. */
export function executeRuleBindings(declarations: RuleDeclaration[], cwd: string): RuleBindingResult[] {
  return declarations
    .filter((declaration) => declaration.checkId !== undefined || declaration.bindingError !== undefined)
    .map((declaration) => {
      const ruleId = declaration.checkId ? `check-${declaration.checkId}` : declaration.id
      if (declaration.bindingError) {
        const reason = declaration.bindingError === 'multiple-markers'
          ? ko.check.bindingMultiple
          : ko.check.bindingInvalidId(declaration.invalidCheckId ?? '')
        return {
          declaration,
          violations: [{
            ruleId,
            severity: 'error' as const,
            message: `${reason} (RULES.md:${declaration.line})`,
          }],
        }
      }

      const checkId = declaration.checkId as string
      const scriptPath = findRuleCheckScript(checkId, cwd)
      if (!scriptPath) {
        return {
          declaration,
          violations: [{
            ruleId,
            severity: 'error' as const,
            message: ko.check.bindingMissing(checkId),
          }],
        }
      }

      const run = runCheckScript(scriptPath, cwd)
      if (run.ok) return { declaration, scriptPath, violations: [] }

      const detail = [run.out, run.err].filter(Boolean).join('\n').split(/\r?\n/).slice(-20).join('\n')
      return {
        declaration,
        scriptPath,
        violations: [{
          ruleId,
          severity: 'error' as const,
          message: `${ko.check.bindingFailed(scriptPath)}${detail ? `\n${detail}` : ''}`,
        }],
      }
    })
}

/** 선언 줄 기준으로 자동 해석 검사와 연결 검사를 합쳐 중복 없이 비율을 계산한다. */
export function computeRuleCoverage(
  declarations: RuleDeclaration[],
  rules: Rule[],
  bindings: RuleBindingResult[]
): Pick<CheckSummary, 'declaredRules' | 'checkedRules' | 'uncheckedRules' | 'coveragePercent'> {
  const checkedLines = new Set<number>()
  for (const rule of rules) {
    if (rule.sourceLine !== undefined) checkedLines.add(rule.sourceLine)
  }
  for (const binding of bindings) {
    if (binding.scriptPath) checkedLines.add(binding.declaration.line)
  }

  const declaredRules = declarations.length
  const checkedRules = declarations.filter((declaration) => checkedLines.has(declaration.line)).length
  const uncheckedRules = declaredRules - checkedRules
  const coveragePercent = declaredRules === 0
    ? 0
    : Math.round((checkedRules / declaredRules) * 1000) / 10
  return { declaredRules, checkedRules, uncheckedRules, coveragePercent }
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

  const declarations = parseRuleDeclarations(rulesPath)
  const rules = parseRules(rulesPath)

  if (rules.length === 0 && declarations.length === 0) {
    if (opts.json) {
      console.log(JSON.stringify({
        totalRules: 0,
        passCount: 0,
        violations: [],
        errors: 0,
        warnings: 0,
        declaredRules: 0,
        checkedRules: 0,
        uncheckedRules: 0,
        coveragePercent: 0,
      }, null, 2))
      return
    }
    console.log(chalk.bold(`\n${ko.check.title}\n`))
    // VHK-011: '검증 가능한' = 코드로 자동 검사되는 일부만. 나머지(any 금지·빈 catch 등)는 수동 확인.
    console.log(chalk.dim(`  📏 자동 검증 가능한 규칙 0개 감지 (나머지 규칙은 수동/도구 확인)\n`))
    console.log(chalk.yellow(ko.check.noAutoRules))
    console.log(chalk.dim('  RULES.md에 파일 이름·폴더 규칙을 적으면 자동으로 점검해요.'))
    return
  }

  const coreSummary = computeCheckSummary(rules, cwd)
  const bindings = executeRuleBindings(declarations, cwd)
  const bindingViolations = bindings.flatMap((binding) => binding.violations)
  const violations = [...coreSummary.violations, ...bindingViolations]
  const summary: CheckSummary = {
    totalRules: coreSummary.totalRules + bindings.filter((binding) => binding.scriptPath).length,
    passCount: coreSummary.passCount
      + bindings.filter((binding) => binding.scriptPath && binding.violations.length === 0).length,
    violations,
    errors: violations.filter((violation) => violation.severity === 'error').length,
    warnings: violations.filter((violation) => violation.severity === 'warning').length,
    ...computeRuleCoverage(declarations, rules, bindings),
  }

  // #374: 실행마다 위반 총계 스냅샷 append(evolve 효과측정 토대) — best-effort, 판정을 막지 않음.
  try {
    appendCheckLog(cwd, buildCheckLogEntry(summary, new Date().toISOString()))
  } catch {
    /* 원장 append 실패 비치명 — check 본 판정은 이미 계산됨 */
  }

  // RFC 0060 T1b: PRD·ARCHITECTURE 잔여 [여기에 작성:] 슬롯 카운트 — 온보딩 진행 측정.
  const fillSlots = countFillSlots(cwd)

  if (opts.json) {
    console.log(JSON.stringify({ ...summary, fillSlots }, null, 2))
    if (summary.errors > 0) process.exitCode = 1
    return
  }

  console.log(chalk.bold(`\n${ko.check.title}\n`))
  console.log(chalk.dim(`  📏 자동 검사 ${summary.totalRules}개 실행`))
  console.log(chalk.cyan(`  ${ko.check.coverage(
    summary.checkedRules,
    summary.declaredRules,
    summary.coveragePercent
  )}`))
  if (summary.uncheckedRules > 0) {
    console.log(chalk.yellow(`  ${ko.check.unchecked(summary.uncheckedRules)}`))
  }
  console.log('')

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

  for (const binding of bindings) {
    const id = binding.declaration.checkId ?? `RULES.md:${binding.declaration.line}`
    if (binding.violations.length === 0) {
      console.log(chalk.green(`  ✅ check-${id}`) + chalk.dim(` — ${ko.check.bindingPassed(id)}`))
      continue
    }
    console.log(chalk.red(`  ❌ check-${id}`) + chalk.dim(` — ${binding.violations.length}건 위반`))
    for (const violation of binding.violations) {
      console.log(`    ${chalk.red('●')} ${violation.message}`)
    }
  }

  console.log('')

  // RFC 0060 T1b: 아직 못 채운 기획·설계 슬롯을 노출(진행 측정 + 다음 행동 유도).
  if (fillSlots.total > 0) {
    console.log(
      chalk.yellow(`  📝 미완성 슬롯 ${fillSlots.total}개`) +
      chalk.dim(` — docs/PRD.md ${fillSlots.prd} · docs/ARCHITECTURE.md ${fillSlots.architecture} ([여기에 작성:] 대화로 채우기)`)
    )
    console.log('')
  }

  if (summary.violations.length === 0) {
    // VHK-011: "모든 규칙 통과" 거짓안심 금지 — 자동 검증된 부분만 통과라고 명시.
    console.log(chalk.green.bold(`✅ 실행한 자동 검사 ${summary.passCount}개 통과`))
    if (summary.uncheckedRules > 0) {
      console.log(chalk.dim(`   (${ko.check.unchecked(summary.uncheckedRules)} — 직접/도구로 확인하세요.)`))
    }
    printNextStep({
      message: '모든 규칙 통과! 보안 스캔도 해볼까요?',
      command: 'vhk 보안 scan',
      cursorHint: '보안 스캔 돌려줘',
    })
  } else {
    console.log(chalk.bold(ko.check.summary))
    console.log(`  검사: ${chalk.cyan(String(summary.totalRules))}개 | 통과: ${chalk.green(String(summary.passCount))}개 | 위반: ${chalk.red(String(summary.violations.length))}건`)
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
