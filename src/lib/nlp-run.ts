import chalk from 'chalk'
import inquirer from 'inquirer'
import { routeNaturalLanguage, extractNotionUrl, type NlpRoute } from './nlp-router.js'
import { ko } from '../i18n/ko.js'
import { gate } from '../commands/gate.js'
import { init } from '../commands/init.js'
import { recap } from '../commands/recap.js'
import { sync } from '../commands/sync.js'
import { check } from '../commands/check.js'
import { secure } from '../commands/secure.js'
import { doctor } from '../commands/doctor.js'
import { ship } from '../commands/ship.js'
import { save } from '../commands/save.js'
import { undo } from '../commands/undo.js'
import { status } from '../commands/status.js'
import { diff } from '../commands/diff.js'
import { mcpInit } from '../commands/mcp-init.js'
import { deploy } from '../commands/deploy.js'
import { env, envCheck } from '../commands/env.js'
import { publish } from '../commands/publish.js'

export async function dispatchNlpRoute(route: NlpRoute, input: string): Promise<void> {
  switch (route.command) {
    case 'gate':
      return gate()
    case 'init':
      return init({
        skipGate: route.args?.includes('--skip-gate'),
        fromNotion: route.args?.includes('--from-notion')
          ? extractNotionUrl(input)
          : undefined,
      })
    case 'recap':
      return recap({})
    case 'sync':
      return sync()
    case 'check':
      return check()
    case 'secure':
      return secure()
    case 'ship':
      return ship()
    case 'doctor':
      return doctor()
    case 'save':
      return save()
    case 'undo':
      return undo()
    case 'status':
      return status()
    case 'diff':
      return diff()
    case 'mcp-init':
      return mcpInit()
    case 'deploy':
      return deploy()
    case 'env':
      return env()
    case 'env-check':
      return envCheck()
    case 'publish':
      return publish()
  }
}

export async function runNaturalLanguageRoute(input: string): Promise<void> {
  const route = routeNaturalLanguage(input)

  if (!route) {
    console.log(chalk.yellow(`\n  ❓ "${input}" — ${ko.nlp.notMatched}\n`))
    return
  }

  console.log('')
  console.log(chalk.cyan(`  💬 "${input}"`))
  console.log(chalk.cyan(`  → ${route.explanation}`))

  if (route.confidence === 'low') {
    const { confirm } = await inquirer.prompt<{ confirm: boolean }>([{
      type: 'confirm',
      name: 'confirm',
      message: `${route.explanation} — ${ko.nlp.matched}`,
      default: true,
    }])
    if (!confirm) {
      console.log(chalk.dim(`  ${ko.nlp.menuHint}`))
      return
    }
  }
  console.log('')

  await dispatchNlpRoute(route, input)
}
