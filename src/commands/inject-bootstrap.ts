import chalk from 'chalk'
import { injectBootstrapAll } from '../lib/inject-bootstrap.js'
import type { InjectBootstrapResult } from '../lib/inject-bootstrap.js'
import { ko } from '../i18n/ko.js'
import { log } from '../utils/logger.js'
import { printNextStep } from '../lib/next-step.js'
import { prompt } from '../lib/prompt.js'
import { isInteractive } from '../lib/interactive.js'

export type InjectBootstrapCommandOptions = {
  yes?: boolean
  force?: boolean
}

function logItem(label: string, result: InjectBootstrapResult): void {
  switch (result) {
    case 'created':
      log.success(`${label}: ${ko.injectBootstrap.itemCreated}`)
      break
    case 'updated':
      log.success(`${label}: ${ko.injectBootstrap.itemUpdated}`)
      break
    case 'unchanged':
      log.info(`${label}: ${ko.injectBootstrap.itemUnchanged}`)
      break
    case 'skipped':
      log.warn(`${label}: ${ko.injectBootstrap.itemSkipped}`)
      break
  }
}

export async function injectBootstrapCommand(
  options: InjectBootstrapCommandOptions = {},
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

  const results = injectBootstrapAll(cwd, { yes: options.yes || force, force })

  logItem('ecosystem.mdc', results.ecosystem)
  logItem('CORE-RULES.md', results.coreRules)
  logItem('.vhk/context.md', results.context)
  logItem('mcp.json.example', results.mcpExample)

  if (Object.values(results).every(r => r === 'skipped')) {
    console.log(chalk.dim(`  ${ko.injectBootstrap.retryHint}`))
    return
  }

  printNextStep({
    message: ko.injectBootstrap.nextHint,
    cursorHint: 'tier S harness — ecosystem + core-rules + context seed + mcp example',
  })
}
