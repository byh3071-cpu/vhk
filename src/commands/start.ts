import chalk from 'chalk'
import inquirer from 'inquirer'
import simpleGit from 'simple-git'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { init } from './init.js'
import { mcpInit } from './mcp-init.js'
import { context } from './context.js'
import { ko } from '../i18n/ko.js'
import { log } from '../utils/logger.js'
import { printNextStep } from '../lib/next-step.js'

export type StartOptions = {
  yes?: boolean
  fromNotion?: string
  name?: string
  description?: string
  type?: string
}

const VHK_FOOTPRINT_FILES = [
  'CLAUDE.md',
  '.cursorrules',
  '.cursor/mcp.json',
  '.vhk/context.md',
  'docs/PRD.md',
]

function detectExistingFootprint(cwd: string): string[] {
  return VHK_FOOTPRINT_FILES.filter(rel => existsSync(join(cwd, rel)))
}

async function runGitInit(cwd: string): Promise<void> {
  try {
    const git = simpleGit(cwd)
    const isRepo = await git.checkIsRepo().catch(() => false)
    if (isRepo) {
      log.info(ko.start.gitAlreadyInit)
      return
    }
    await git.init()
    log.success(ko.start.gitInitDone)
  } catch (err) {
    log.error(`git init 실패: ${err instanceof Error ? err.message : String(err)}`)
    throw new Error('step1-git-init')
  }
}

async function runStep<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error(`${label} 실패: ${msg}`)
    log.warn('마법사를 중단합니다. 이미 생성된 파일은 그대로 남아있어요.')
    log.warn('문제를 고친 뒤 `vhk start`를 다시 실행하거나, 개별 명령(`vhk init`, `vhk mcp-init`, `vhk context`)으로 이어 진행하세요.')
    throw err
  }
}

export async function start(options: StartOptions = {}): Promise<void> {
  console.log(chalk.bold(`\n${ko.start.title}\n`))
  console.log(chalk.dim(ko.start.intro))
  console.log(chalk.dim(`  ${ko.start.step1}`))
  console.log(chalk.dim(`  ${ko.start.step2}`))
  console.log(chalk.dim(`  ${ko.start.step3}`))
  console.log(chalk.dim(`  ${ko.start.step4}`))
  console.log()

  const cwd = process.cwd()

  // 안전 가드: 이미 VHK 설치 흔적이 있으면 경고 + 명시적 확인.
  // (init이 파일별 overwrite를 묻지만, MCP 설정·context 파일은 무경고 갱신되므로 마법사 진입부에서 1차 차단)
  const footprint = detectExistingFootprint(cwd)
  if (footprint.length > 0 && !options.yes) {
    console.log(chalk.yellow('⚠️  이미 VHK 설치 흔적이 감지됐어요:'))
    for (const f of footprint) console.log(chalk.dim(`   - ${f}`))
    console.log(chalk.dim('   계속 진행하면 일부 파일(`.cursor/mcp.json`, `.vhk/context.md`)은 갱신·덮어쓰기됩니다.'))
    const { proceedExisting } = await inquirer.prompt<{ proceedExisting: boolean }>([{
      type: 'confirm',
      name: 'proceedExisting',
      message: '그래도 다시 마법사를 진행할까요?',
      default: false,
    }])
    if (!proceedExisting) {
      log.warn(ko.start.cancelled)
      return
    }
  } else if (!options.yes) {
    const { proceed } = await inquirer.prompt<{ proceed: boolean }>([{
      type: 'confirm',
      name: 'proceed',
      message: ko.start.confirmStart,
      default: true,
    }])
    if (!proceed) {
      log.warn(ko.start.cancelled)
      return
    }
  }

  log.step(ko.start.step1Header)
  await runStep('[1/4] git init', () => runGitInit(cwd))

  log.step(ko.start.step2Header)
  await runStep('[2/4] vhk init', () => init({
    skipGate: true,
    fromNotion: options.fromNotion,
    name: options.name,
    description: options.description,
    type: options.type,
    yes: options.yes,
  }))

  log.step(ko.start.step3Header)
  await runStep('[3/4] vhk mcp-init', () => mcpInit())

  log.step(ko.start.step4Header)
  await runStep('[4/4] vhk context', () => context())

  console.log(chalk.bold.green(`\n${ko.start.allDone}\n`))
  printNextStep({
    message: ko.start.nextHintMessage,
    cursorHint: ko.start.nextHintCursor,
  })
}
