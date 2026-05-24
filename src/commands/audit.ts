import { execSync } from 'node:child_process'
import chalk from 'chalk'
import inquirer from 'inquirer'
import ora from 'ora'
import { t } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'

interface AuditSummary {
  critical: number
  high: number
  moderate: number
  low: number
  total: number
}

function parseAuditOutput(output: string): AuditSummary {
  try {
    const json = JSON.parse(output) as {
      metadata?: { vulnerabilities?: Partial<AuditSummary> }
    }
    const v = json.metadata?.vulnerabilities ?? {}
    return {
      critical: v.critical ?? 0,
      high: v.high ?? 0,
      moderate: v.moderate ?? 0,
      low: v.low ?? 0,
      total: v.total ?? 0,
    }
  } catch {
    return { critical: 0, high: 0, moderate: 0, low: 0, total: 0 }
  }
}

function runNpmAuditJson(): string {
  // npm audit는 취약점 발견 시 exit code !=0 → execSync가 throw 하지만 stdout은 채워진다.
  // shell stderr redirect(`2>/dev/null`)는 Windows PowerShell에서 동작 X → stdio 옵션으로 처리.
  try {
    return execSync('npm audit --json', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString()
  } catch (err) {
    const e = err as { stdout?: Buffer | string }
    if (e.stdout) return e.stdout.toString()
    return ''
  }
}

function runNpmAuditFix(): void {
  execSync('npm audit fix', { stdio: ['pipe', 'pipe', 'pipe'] })
}

export async function audit(autoFix = false): Promise<void> {
  console.log(chalk.bold('\n🛡️  ' + t('audit.title')))
  console.log(chalk.gray('─'.repeat(40)))

  const spinner = ora('보안 감사 실행 중...').start()
  const output = runNpmAuditJson()
  spinner.stop()

  const summary = parseAuditOutput(output)

  if (summary.total === 0) {
    console.log(chalk.green.bold('\n🎉 취약점이 발견되지 않았습니다!'))
    return
  }

  console.log(chalk.bold('\n📊 취약점 요약:'))
  if (summary.critical > 0) console.log(chalk.red(`  🔴 Critical: ${summary.critical}`))
  if (summary.high > 0) console.log(chalk.red(`  🟠 High: ${summary.high}`))
  if (summary.moderate > 0) console.log(chalk.yellow(`  🟡 Moderate: ${summary.moderate}`))
  if (summary.low > 0) console.log(chalk.gray(`  ⚪ Low: ${summary.low}`))
  console.log(chalk.bold(`\n  총 ${summary.total}개의 취약점`))

  const shouldRunFix = autoFix
    ? true
    : summary.critical > 0 || summary.high > 0
      ? (
          await inquirer.prompt<{ shouldFix: boolean }>([
            {
              type: 'confirm',
              name: 'shouldFix',
              message: '자동 수정을 시도할까요? (npm audit fix)',
              default: true,
            },
          ])
        ).shouldFix
      : false

  if (shouldRunFix) {
    const fixSpinner = ora('자동 수정 중...').start()
    try {
      runNpmAuditFix()
      fixSpinner.succeed('자동 수정 완료!')
    } catch {
      fixSpinner.warn('일부 취약점은 수동 수정이 필요합니다.')
    }
  }

  printNextStep({
    message: '보안 감사 완료.',
    command: 'vhk harness',
    cursorHint: '품질 점검해줘',
  })
}
