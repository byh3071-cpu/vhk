import chalk from 'chalk'
import path from 'node:path'
import { readHomeConfig, writeHomeConfig } from '../lib/home-config.js'
import { tryLoadLive, tryLoadRulesFile } from '../lib/core-rules.js'
import { printNextStep } from '../lib/next-step.js'
import { ko } from '../i18n/ko.js'

/**
 * `vhk config set-rules-root <path>` — goal 92.
 * ~/.vhk/config.json 에 rulesRoot 를 저장한다. PRIVATE_RULES_ROOT 환경변수와 달리
 * 매 실행마다 디스크에서 새로 읽으므로 터미널/Claude Code 재시작 없이 다음 명령부터 바로 반영된다.
 *
 * 저장 직후 "방금 저장한 그 경로" 자체가 유효한지 tryLoadLive 로 직접 확인한다(loadCoreRuleset()
 * 전체 우선순위가 아니라) — critic 지적(M2): PRIVATE_RULES_ROOT 가 다른 유효 경로를 가리키면
 * loadCoreRuleset() 은 env 쪽을 먼저 반환하므로, 그걸로 "성공"을 판단하면 방금 저장한 값이
 * 실제로는 아직 안 쓰이는데도 성공했다고 오도할 수 있다.
 *
 * critic 재검증 지적(main 병합 후): 상대경로를 그대로 저장하면 "저장 시점의 cwd"에서만 맞는
 * 경로가 되어, 이후 다른 프로젝트 디렉터리(다른 cwd)에서 loadCoreRuleset() 이 같은 값을 다르게
 * 해석해 조용히 bundled 로 폴백한다 — path.resolve 로 저장 전 절대경로 정규화.
 */
export async function configSetrulesRoot(rulesRootPath: string, homeDir?: string): Promise<void> {
  console.log(chalk.bold(`\n${ko.config.setrulesRootTitle}\n`))

  const resolvedPath = path.resolve(rulesRootPath)
  writeHomeConfig({ ...(readHomeConfig(homeDir) ?? {}), rulesRoot: resolvedPath }, homeDir)
  console.log(chalk.dim(`  ${ko.config.saved(resolvedPath)}`))

  const saved = tryLoadLive(resolvedPath)
  if (!saved) {
    console.log(chalk.yellow(`\n  ⚠️ ${ko.config.notFoundWarn}`))
    console.log(chalk.dim(`     ${ko.config.notFoundHint(resolvedPath)}`))
    printNextStep({ message: ko.config.nextHint, command: 'vhk context', cursorHint: '헌법 소스 확인해줘' })
    return
  }

  const envRoot = process.env.PRIVATE_RULES_ROOT
  const envOverrides = Boolean(envRoot) && tryLoadLive(envRoot as string) !== null
  if (envOverrides) {
    console.log(chalk.yellow(`\n  ⚠️ ${ko.config.envOverrideWarn(envRoot as string)}`))
    console.log(chalk.dim(`     ${ko.config.envOverrideHint}`))
  } else {
    console.log(chalk.green(`\n  ✅ ${ko.config.liveConfirmed(saved.version)}`))
    console.log(chalk.dim(`  ${ko.config.liveNote}`))
  }

  printNextStep({
    message: ko.config.nextHint,
    command: 'vhk context',
    cursorHint: '헌법 소스 확인해줘',
  })
}

export async function configSetRulesFile(rulesFilePath: string, homeDir?: string): Promise<void> {
  console.log(chalk.bold(`\n${ko.config.setRulesFileTitle}\n`))

  const resolvedPath = path.resolve(rulesFilePath)
  const loaded = tryLoadRulesFile(resolvedPath)
  if (!loaded) {
    console.log(chalk.yellow(`  ⚠️ ${ko.config.rulesFileInvalid(resolvedPath)}`))
    process.exitCode = 1
    return
  }

  writeHomeConfig({ ...(readHomeConfig(homeDir) ?? {}), rulesFile: resolvedPath }, homeDir)
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
