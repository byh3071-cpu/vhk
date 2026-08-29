import chalk from 'chalk'
import { doctor } from './doctor.js'
import { goalMigrate } from './goal.js'
import { injectBootstrapCommand } from './inject-bootstrap.js'
import { mcpInit } from './mcp-init.js'
import { sync } from './sync.js'
import { verify } from './verify.js'
import { ko } from '../i18n/ko.js'
import { log } from '../utils/logger.js'
import { printNextStep } from '../lib/next-step.js'
import { ensureNotHardStopped } from '../lib/hard-stop-guard.js'
import { installAgentSkills } from '../lib/agent-skill-templates.js'

export type BootstrapCursorOptions = {
  yes?: boolean
  skipVerify?: boolean
}

async function runStep<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error(`${label} 실패: ${msg}`)
    throw err
  }
}

/** #467 MVP: Cursor 독푸딩 — doctor + goal migrate + inject-bootstrap + mcp-init + sync + skills + verify */
export async function bootstrapCursor(options: BootstrapCursorOptions = {}): Promise<void> {
  if (!ensureNotHardStopped('bootstrap cursor')) return

  const yes = options.yes === true
  console.log(chalk.bold(`\n${ko.bootstrapCursor.title}\n`))

  log.step(ko.bootstrapCursor.stepDoctor)
  await runStep(ko.bootstrapCursor.stepDoctor, () => doctor({ strict: false }))

  log.step(ko.bootstrapCursor.stepGoalMigrate)
  await runStep(ko.bootstrapCursor.stepGoalMigrate, () => goalMigrate({ dryRun: true }))

  log.step(ko.bootstrapCursor.stepInject)
  await runStep(ko.bootstrapCursor.stepInject, () => injectBootstrapCommand({ yes }))

  log.step(ko.bootstrapCursor.stepMcp)
  await runStep(ko.bootstrapCursor.stepMcp, () => mcpInit())

  log.step(ko.bootstrapCursor.stepSync)
  await runStep(ko.bootstrapCursor.stepSync, () => sync({ yes }))

  log.step(ko.bootstrapCursor.stepSkills)
  const skills = installAgentSkills()
  if (skills.created.length > 0) {
    console.log(chalk.green(`  ${ko.bootstrapCursor.skillsCreated(skills.created)}`))
  }
  if (skills.updated.length > 0) {
    console.log(chalk.green(`  ${ko.bootstrapCursor.skillsUpdated(skills.updated)}`))
  }
  if (skills.unchanged.length > 0) {
    console.log(chalk.dim(`  ${ko.bootstrapCursor.skillsSkipped(skills.unchanged)}`))
  }
  if (skills.conflicts.length > 0) {
    console.log(chalk.yellow(`  ${ko.bootstrapCursor.skillsOutdated(skills.conflicts)}`))
  }

  if (!options.skipVerify) {
    log.step(ko.bootstrapCursor.stepVerify)
    await runStep(ko.bootstrapCursor.stepVerify, () => verify({}))
  }

  console.log(chalk.bold.green(`\n${ko.bootstrapCursor.done}\n`))
  printNextStep({
    message: ko.bootstrapCursor.nextHint,
    command: 'vhk gate',
    cursorHint: 'vhk-gate skill 로 verify receipt review 실행해줘',
  })
}
