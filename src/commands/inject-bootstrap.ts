import chalk from 'chalk'
import { injectBootstrap } from '../lib/inject-bootstrap.js'
import { ko } from '../i18n/ko.js'
import { log } from '../utils/logger.js'
import { printNextStep } from '../lib/next-step.js'
import { prompt } from '../lib/prompt.js'
import { isInteractive } from '../lib/interactive.js'

export type InjectBootstrapCommandOptions = {
  yes?: boolean
  force?: boolean
}

export async function injectBootstrapCommand(
  options: InjectBootstrapCommandOptions = {}
): Promise<void> {
  const cwd = process.cwd()
  const force = options.force === true

  if (!force && !options.yes && isInteractive(options)) {
    const { proceed } = await prompt<{ proceed: boolean }>([{
      type: 'confirm',
      name: 'proceed',
      message: ko.injectBootstrap.confirm,
      default: true,
    }])
    if (!proceed) {
      log.warn(ko.injectBootstrap.cancelled)
      return
    }
  }

  const result = injectBootstrap(cwd, { yes: options.yes || force, force })

  switch (result) {
    case 'created':
      log.success(ko.injectBootstrap.created)
      break
    case 'updated':
      log.success(ko.injectBootstrap.updated)
      break
    case 'unchanged':
      log.info(ko.injectBootstrap.unchanged)
      break
    case 'skipped':
      log.warn(ko.injectBootstrap.skipped)
      console.log(chalk.dim(`  ${ko.injectBootstrap.retryHint}`))
      return
  }

  printNextStep({
    message: ko.injectBootstrap.nextHint,
    cursorHint: 'ecosystem.mdc 설치됨 — Cursor cross-repo 작업 시 contract obey',
  })
}
