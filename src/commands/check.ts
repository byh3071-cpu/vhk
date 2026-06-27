import chalk from 'chalk'
import path from 'node:path'
import fs from 'node:fs'
import { parseRules, type RuleViolation } from '../lib/rules-parser.js'
import { ko } from '../i18n/ko.js'
import { log } from '../utils/logger.js'
import { printNextStep } from '../lib/next-step.js'
import { goalCheck } from './goal.js'

export interface CheckOptions {
  goal?: string
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
  return checkRules()
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

async function checkRules() {
  console.log(chalk.bold(`\n${ko.check.title}\n`))

  const cwd = process.cwd()
  const rulesPath = path.join(cwd, 'RULES.md')

  if (!fs.existsSync(rulesPath)) {
    console.log(chalk.yellow(ko.check.noRules))
    console.log(chalk.dim('  vhk init으로 시작하거나 RULES.md를 만들어 보세요.'))
    return
  }

  const rules = parseRules(rulesPath)
  // VHK-011: '검증 가능한' = 코드로 자동 검사되는 일부만. 나머지(any 금지·빈 catch 등)는 수동 확인.
  console.log(chalk.dim(`  📏 자동 검증 가능한 규칙 ${rules.length}개 감지 (나머지 규칙은 수동/도구 확인)\n`))

  if (rules.length === 0) {
    console.log(chalk.yellow(ko.check.noAutoRules))
    console.log(chalk.dim('  RULES.md에 파일 이름·폴더 규칙을 적으면 자동으로 점검해요.'))
    return
  }

  const allViolations: RuleViolation[] = []
  let passCount = 0

  for (const rule of rules) {
    const violations = rule.check(cwd)
    if (violations.length === 0) {
      // VHK-013: content(금지/필수) 규칙은 description 60자 컷에 가려진 '실제 검사 패턴'을 함께 표기.
      const patternHint = rule.type === 'content' && rule.pattern ? chalk.dim(` [검사: ${rule.pattern.source}]`) : ''
      console.log(chalk.green(`  ✅ ${rule.id}`) + chalk.dim(` — ${rule.description.slice(0, 60)}`) + patternHint)
      passCount++
    } else {
      console.log(chalk.red(`  ❌ ${rule.id}`) + chalk.dim(` — ${violations.length}건 위반`))
      violations.forEach(v => {
        const loc = v.file ? chalk.dim(` (${v.file}${v.line ? ':' + v.line : ''})`) : ''
        const icon = v.severity === 'error' ? chalk.red('✖')
          : v.severity === 'warning' ? chalk.yellow('⚠')
          : chalk.blue('ℹ')
        console.log(`    ${icon} ${v.message}${loc}`)
      })
      allViolations.push(...violations)
    }
  }

  console.log('')
  const errors = allViolations.filter(v => v.severity === 'error').length
  const warnings = allViolations.filter(v => v.severity === 'warning').length

  if (allViolations.length === 0) {
    // VHK-011: "모든 규칙 통과" 거짓안심 금지 — 자동 검증된 부분만 통과라고 명시.
    console.log(chalk.green.bold(`✅ 자동 검증 가능한 규칙 ${passCount}개 통과`))
    console.log(chalk.dim('   (RULES.md 의 나머지 규칙은 코드 자동 검사 불가 — 직접/도구로 확인하세요.)'))
    printNextStep({
      message: '모든 규칙 통과! 보안 스캔도 해볼까요?',
      command: 'vhk 보안 scan',
      cursorHint: '보안 스캔 돌려줘',
    })
  } else {
    console.log(chalk.bold(ko.check.summary))
    console.log(`  규칙: ${chalk.cyan(String(rules.length))}개 | 통과: ${chalk.green(String(passCount))}개 | 위반: ${chalk.red(String(allViolations.length))}건`)
    if (errors > 0) console.log(`  ${chalk.red(`✖ ${errors}개 에러`)}`)
    if (warnings > 0) console.log(`  ${chalk.yellow(`⚠ ${warnings}개 경고`)}`)
    printNextStep({
      message: '위반 항목을 수정한 후 다시 점검하세요.',
      command: 'vhk 점검',
      cursorHint: '위반 항목 수정해줘',
    })
  }

  if (errors > 0) {
    process.exitCode = 1
  }
}
