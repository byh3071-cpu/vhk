import { existsSync } from 'node:fs'
import chalk from 'chalk'
import inquirer from 'inquirer'
import ora from 'ora'
import { t } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { safeExecFile } from '../lib/exec.js'

export type PackageManager = 'npm' | 'yarn' | 'pnpm'

export interface AuditSummary {
  critical: number
  high: number
  moderate: number
  low: number
  total: number
}

export function detectCurrentPM(): PackageManager {
  if (existsSync('pnpm-lock.yaml')) return 'pnpm'
  if (existsSync('yarn.lock')) return 'yarn'
  return 'npm'
}

export function parseAuditOutput(output: string, pm: PackageManager): AuditSummary {
  const empty: AuditSummary = { critical: 0, high: 0, moderate: 0, low: 0, total: 0 }
  if (!output) return empty
  try {
    const json = JSON.parse(output) as Record<string, unknown>
    // npm / yarn classic: { metadata: { vulnerabilities: {...} } }
    // pnpm: 동일한 npm-compat 출력 (npm audit JSON 포맷 그대로)
    // yarn berry: { advisories: {...} } — total만 별도 계산
    const meta = (json.metadata as { vulnerabilities?: Partial<AuditSummary> } | undefined)
      ?.vulnerabilities
    if (meta) {
      const summary = {
        critical: meta.critical ?? 0,
        high: meta.high ?? 0,
        moderate: meta.moderate ?? 0,
        low: meta.low ?? 0,
        total: meta.total ?? 0,
      }
      if (!summary.total) {
        summary.total = summary.critical + summary.high + summary.moderate + summary.low
      }
      return summary
    }
    // pm 별 fallback이 더 필요하면 여기에 분기
    void pm
    return empty
  } catch {
    return empty
  }
}

export function runAuditJson(pm: PackageManager): string {
  // 취약점 발견 시 exit code !=0지만 stdout에 JSON 출력. safeExecFile은 err 경로에서도 out 반환.
  const result = safeExecFile(pm, ['audit', '--json'])
  return result.out
}

function runAuditFix(pm: PackageManager): { ok: boolean; err?: string } {
  // pnpm은 `audit --fix` 미지원 → audit만 다시 안내. yarn classic은 `audit fix` 미지원.
  // npm만 자동 fix 지원.
  if (pm !== 'npm') {
    return { ok: false, err: `${pm}은 자동 fix를 지원하지 않습니다. npm 환경에서만 동작합니다.` }
  }
  const result = safeExecFile('npm', ['audit', 'fix'])
  return result.ok ? { ok: true } : { ok: false, err: result.err }
}

export async function audit(autoFix = false): Promise<void> {
  console.log(chalk.bold('\n🛡️  ' + t('audit.title')))
  console.log(chalk.gray('─'.repeat(40)))

  const pm = detectCurrentPM()
  console.log(chalk.cyan(`📦 패키지 매니저: ${pm}`))

  const spinner = ora('보안 감사 실행 중...').start()
  const output = runAuditJson(pm)
  spinner.stop()

  const summary = parseAuditOutput(output, pm)

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
    const result = runAuditFix(pm)
    if (result.ok) {
      fixSpinner.succeed('자동 수정 완료!')
    } else {
      fixSpinner.warn(result.err ?? '일부 취약점은 수동 수정이 필요합니다.')
    }
  }

  printNextStep({
    message: '보안 감사 완료.',
    command: 'vhk harness',
    cursorHint: '품질 점검해줘',
  })
}
