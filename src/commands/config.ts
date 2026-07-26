import chalk from 'chalk'
import path from 'node:path'
import { writeHomeConfig } from '../lib/home-config.js'
import { tryLoadRulesFile } from '../lib/core-rules.js'
import { printNextStep } from '../lib/next-step.js'
import { ko } from '../i18n/ko.js'

export async function configSetRulesFile(rulesFilePath: string, homeDir?: string): Promise<void> {
  console.log(chalk.bold(`\n${ko.config.setRulesFileTitle}\n`))

  const resolvedPath = path.resolve(rulesFilePath)
  const loaded = tryLoadRulesFile(resolvedPath)
  if (!loaded) {
    console.log(chalk.yellow(`  ⚠️ ${ko.config.rulesFileInvalid(resolvedPath)}`))
    process.exitCode = 1
    return
  }

  // v3 설정 스키마는 rulesFile 하나뿐이다. 과거/알 수 없는 키를 다시 저장하지 않는다.
  writeHomeConfig({ rulesFile: resolvedPath }, homeDir)
  console.log(chalk.dim(`  ${ko.config.saved(resolvedPath)}`))

  const envRulesFile = process.env.VHK_RULES_FILE
  if (envRulesFile && path.resolve(envRulesFile) !== resolvedPath) {
    console.log(chalk.yellow(`\n  ⚠️ ${ko.config.rulesFileEnvOverride(envRulesFile)}`))
  } else {
    console.log(chalk.green(`\n  ✅ ${ko.config.liveConfirmed(loaded.version)}`))
    console.log(chalk.dim(`  ${ko.config.liveNote}`))
  }

  printNextStep({
    message: ko.config.nextHint,
    command: 'vhk context',
    cursorHint: '규칙 소스 확인해줘',
  })
}
