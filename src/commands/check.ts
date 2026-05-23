import chalk from 'chalk'
import path from 'node:path'
import fs from 'node:fs'
import { parseRules, type RuleViolation } from '../lib/rules-parser.js'
import { ko } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'

export async function check() {
  console.log(chalk.bold(`\n${ko.check.title}\n`))

  const cwd = process.cwd()
  const rulesPath = path.join(cwd, 'RULES.md')

  if (!fs.existsSync(rulesPath)) {
    console.log(chalk.yellow(ko.check.noRules))
    console.log(chalk.dim('  vhk init으로 시작하거나 RULES.md를 만들어 보세요.'))
    return
  }

  const rules = parseRules(rulesPath)
  console.log(chalk.dim(`  📏 ${rules.length}개 검증 가능한 규칙 감지\n`))

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
      console.log(chalk.green(`  ✅ ${rule.id}`) + chalk.dim(` — ${rule.description.slice(0, 60)}`))
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
    console.log(chalk.green.bold(`${ko.check.allPassed} (${passCount}/${rules.length})`))
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
