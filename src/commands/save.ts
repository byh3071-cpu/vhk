import { execFileSync } from 'node:child_process'
import chalk from 'chalk'
import ora from 'ora'
import inquirer from 'inquirer'
import { printSecurityWarnings } from '../lib/check-secure.js'
import { parsePorcelainLines } from '../lib/git-porcelain.js'
import {
  getGitRoot,
  gitOut,
  gitRun,
  hasGitRemote,
  getExecErrorMessage,
} from '../lib/git-repo.js'
import { filterSevereFindings, scanProjectForSecrets } from '../lib/scan-secrets.js'
import { printNextStep } from '../lib/next-step.js'
import { promptOrDefault } from '../lib/interactive.js'
import { t } from '../i18n/ko.js'

export function formatDefaultCommitMessage(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `✨ vhk save: ${y}-${m}-${d} ${h}:${min}`
}

function statusIcon(code: string): string {
  if (code.includes('M')) return '✏️'
  if (code.includes('A') || code.includes('?')) return '➕'
  if (code.includes('D')) return '🗑️'
  return '📄'
}

export interface SaveOptions {
  /** #154: 커밋 메시지 직접 지정 — 비-TTY/에이전트에서 MCP save 처럼 의미있는 메시지 사용. */
  message?: string
}

export async function save(opts: SaveOptions = {}): Promise<void> {
  console.log(chalk.bold(`\n💾 ${t('save.title')}`))
  console.log(chalk.gray('─'.repeat(40)))

  let gitRoot: string
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'pipe' })
    gitRoot = getGitRoot()
  } catch {
    console.log(chalk.red(`❌ ${t('save.notGitRepo')}`))
    return
  }

  console.log(chalk.cyan(`\n🔒 ${t('save.securityWarnHeader')}`))
  printSecurityWarnings(gitRoot)

  const severe = filterSevereFindings(scanProjectForSecrets(gitRoot).findings)
  if (severe.length > 0) {
    console.log(chalk.red(`\n⚠️  ${t('save.secretsFound', severe.length)}`))
    severe.slice(0, 5).forEach(f => {
      console.log(chalk.dim(`   ${f.file}:${f.line} — ${f.patternName}`))
    })
    if (severe.length > 5) {
      console.log(chalk.dim(`   ... 외 ${severe.length - 5}건 (vhk 보안 scan)`))
    }
    const proceed = await promptOrDefault(
      async () => (await inquirer.prompt<{ proceed: boolean }>([{
        type: 'confirm',
        name: 'proceed',
        message: t('save.secretsConfirm'),
        default: false,
      }])).proceed,
      false,   // 비대화형 = 시크릿 커밋 안 함 (안전)
    )
    if (!proceed) {
      console.log(chalk.gray(t('save.cancelled')))
      return
    }
  }

  const lines = parsePorcelainLines(gitOut(['status', '--porcelain'], gitRoot))
  if (lines.length === 0) {
    console.log(chalk.yellow(`📭 ${t('save.noChanges')}`))
    return
  }

  console.log(chalk.cyan(`\n📋 ${t('save.filesHeader', lines.length)}`))
  lines.forEach(line => {
    const code = line.substring(0, 2)
    const name = line.substring(3)
    console.log(`   ${statusIcon(code)} ${name}`)
  })

  // #154: --message 제공 시 프롬프트 건너뛰고 그대로 사용(MCP save 파리티). 없으면 기존 흐름
  // (TTY → 프롬프트 / 비-TTY → 기본 메시지).
  const message = opts.message?.trim()
    ? opts.message.trim()
    : await promptOrDefault(
        async () => (await inquirer.prompt<{ message: string }>([{
          type: 'input',
          name: 'message',
          message: t('save.commitMessage'),
          default: formatDefaultCommitMessage(),
        }])).message,
        'chore: vhk save',
      )

  const spinner = ora(t('save.saving')).start()
  let didAdd = false
  try {
    gitRun(['add', '.'], gitRoot)
    didAdd = true
    gitRun(['commit', '-m', message], gitRoot)
    spinner.text = t('save.pushing')

    if (!hasGitRemote(gitRoot)) {
      spinner.succeed(t('save.successLocal'))
      console.log(chalk.yellow(`   💡 ${t('save.noRemote')}`))
    } else {
      try {
        gitRun(['push'], gitRoot)
        spinner.succeed(t('save.successWithPush'))
      } catch (pushErr) {
        spinner.fail(t('save.pushFailed'))
        console.log(chalk.red(getExecErrorMessage(pushErr)))
        console.log(chalk.yellow(`\n💡 ${t('save.commitOkPushFailed')}`))
        process.exitCode = 1
      }
    }

    if (process.exitCode !== 1) {
      console.log(chalk.green(`\n✅ ${t('save.done', lines.length)}`))
      printNextStep({
        message: t('save.nextOkMessage'),
        command: 'vhk recap',
        cursorHint: t('save.nextOkCursor'),
      })
    } else {
      console.log(chalk.green(`\n✅ ${t('save.doneLocalOnly', lines.length)}`))
      printNextStep({
        message: t('save.nextPushFailMessage'),
        command: 'vhk doctor',
        cursorHint: t('save.nextPushFailCursor'),
      })
    }
  } catch (err) {
    spinner.fail(t('save.failed'))
    console.log(chalk.red(getExecErrorMessage(err)))
    if (didAdd) {
      try {
        const staged = gitOut(['diff', '--cached', '--stat'], gitRoot).trim()
        if (staged) {
          console.log(chalk.yellow(`\n💡 ${t('save.stagedAfterFail')}`))
        }
      } catch {
        /* ignore */
      }
    }
    process.exitCode = 1
  }
}
