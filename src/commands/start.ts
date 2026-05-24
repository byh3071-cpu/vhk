import chalk from 'chalk'
import inquirer from 'inquirer'
import simpleGit from 'simple-git'
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

async function runGitInit(cwd: string): Promise<void> {
  const git = simpleGit(cwd)
  const isRepo = await git.checkIsRepo().catch(() => false)
  if (isRepo) {
    log.info(ko.start.gitAlreadyInit)
    return
  }
  await git.init()
  log.success(ko.start.gitInitDone)
}

export async function start(options: StartOptions = {}): Promise<void> {
  console.log(chalk.bold(`\n${ko.start.title}\n`))
  console.log(chalk.dim(ko.start.intro))
  console.log(chalk.dim(`  ${ko.start.step1}`))
  console.log(chalk.dim(`  ${ko.start.step2}`))
  console.log(chalk.dim(`  ${ko.start.step3}`))
  console.log(chalk.dim(`  ${ko.start.step4}`))
  console.log()

  if (!options.yes) {
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

  const cwd = process.cwd()

  log.step(ko.start.step1Header)
  await runGitInit(cwd)

  log.step(ko.start.step2Header)
  await init({
    skipGate: true,
    fromNotion: options.fromNotion,
    name: options.name,
    description: options.description,
    type: options.type,
    yes: options.yes,
  })

  log.step(ko.start.step3Header)
  await mcpInit()

  log.step(ko.start.step4Header)
  await context()

  console.log(chalk.bold.green(`\n${ko.start.allDone}\n`))
  printNextStep({
    message: ko.start.nextHintMessage,
    cursorHint: ko.start.nextHintCursor,
  })
}
