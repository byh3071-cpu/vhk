import { execFileSync } from 'node:child_process'
import chalk from 'chalk'
import ora from 'ora'
import { prompt } from '../lib/prompt.js'
import { printSecurityWarnings } from '../lib/check-secure.js'
import { parsePorcelainLines } from '../lib/git-porcelain.js'
import {
  getGitRoot,
  hasGitRemote,
  getExecErrorMessage,
} from '../lib/git-repo.js'
// Goal 48: save 의 git 질문(status/add/commit/push/staged-stat)은 git-session 공유 SoT(MCP 와 동일 함수).
import { okOut, statusPorcelain, stageAll, commit, push, stagedStat } from '../lib/git-session.js'
import type { ExecResult } from '../lib/exec.js'
import { filterSevereFindings, scanProjectForSecrets } from '../lib/scan-secrets.js'
import { printNextStep } from '../lib/next-step.js'
import { promptOrDefault } from '../lib/interactive.js'
import { t } from '../i18n/ko.js'

// git-session 함수는 ExecResult 를 반환(throw 안 함). save 의 기존 try/catch throw 흐름을
// 유지하기 위해 실패를 예외로 승격한다(git stderr 보존 → getExecErrorMessage 표시).
function must(r: ExecResult): string {
  if (!r.ok) throw new Error(r.stderr || r.err)
  return r.out
}

// #286: 변경 파일 목록(git porcelain 라인)으로 의미있는 커밋 메시지를 만든다.
// 이전엔 비-TTY/에이전트 저장이 항상 'chore: vhk save' 로 고정돼 git 히스토리에서 작업을
// 구분할 수 없었다(독푸딩 cafe-pos-vhk 14커밋 전부 동일). 이제 변경 파일/개수를 반영해
// 저장마다 다른 메시지를 만든다. 사용자가 -m 으로 직접 지정하면 그쪽이 우선.
const SUBJECT_MAX = 72
export function formatChangeSummaryMessage(lines: string[]): string {
  const prefix = 'chore: vhk save'
  // porcelain v1: "XY path" (코드 2자 + 공백 + 경로). rename 은 "old -> new" → new 만 취함.
  const paths = lines
    .map(line => {
      const name = line.slice(3).trim()
      const arrow = name.lastIndexOf(' -> ')
      return (arrow >= 0 ? name.slice(arrow + 4) : name).trim()
    })
    .filter(Boolean)

  if (paths.length === 0) return prefix
  if (paths.length === 1) return `${prefix} — ${paths[0]}`.replace(/\r?\n/g, ' ')

  // subject 상한(~72자 conventional) 안에서 가능한 파일을 나열, 나머지는 '+N more'.
  // 상한은 근사치 — ' +N more' 접미사는 길이 검사 후 덧붙으므로 최종 길이가 SUBJECT_MAX 를
  // 접미사 길이만큼 넘을 수 있다(git subject 는 hard limit 아님 → 허용).
  const head = `${prefix} — ${paths.length} files: `
  const shown: string[] = []
  for (const p of paths) {
    if (shown.length > 0 && (head + [...shown, p].join(', ')).length > SUBJECT_MAX) break
    shown.push(p)
  }
  const remaining = paths.length - shown.length
  const list = shown.join(', ') + (remaining > 0 ? ` +${remaining} more` : '')
  return `${head}${list}`.replace(/\r?\n/g, ' ')
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
      async () => (await prompt<{ proceed: boolean }>([{
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

  const lines = parsePorcelainLines(must(statusPorcelain(gitRoot)))
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

  // 메시지 우선순위(#286 + #154): ① --message(에이전트/사용자 직접) → ② TTY 프롬프트
  // (기본값 = 변경요약) → ③ 비-TTY fallback(변경요약). 항상 'chore: vhk save' 고정이던
  // 과거와 달리, 변경 파일을 반영해 매 저장마다 의미있는 메시지를 만든다(히스토리 구분 가능).
  const autoMessage = formatChangeSummaryMessage(lines)
  const message = opts.message?.trim()
    ? opts.message.trim()
    : await promptOrDefault(
        async () => (await prompt<{ message: string }>([{
          type: 'input',
          name: 'message',
          message: t('save.commitMessage'),
          default: autoMessage,
        }])).message,
        autoMessage,
      )

  const spinner = ora(t('save.saving')).start()
  let didAdd = false
  try {
    must(stageAll(gitRoot))
    didAdd = true
    must(commit(message, gitRoot))
    spinner.text = t('save.pushing')

    if (!hasGitRemote(gitRoot)) {
      spinner.succeed(t('save.successLocal'))
      console.log(chalk.yellow(`   💡 ${t('save.noRemote')}`))
    } else {
      try {
        must(push(gitRoot))
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
        const staged = okOut(stagedStat(gitRoot)).trim()
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
