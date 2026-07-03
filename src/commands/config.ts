import chalk from 'chalk'
import { writeHomeConfig } from '../lib/home-config.js'
import { tryLoadLive } from '../lib/core-rules.js'
import { printNextStep } from '../lib/next-step.js'
import { ko } from '../i18n/ko.js'

/**
 * `vhk config set-brain-root <path>` — goal 92.
 * ~/.vhk/config.json 에 brainRoot 를 저장한다. YOHAN_BRAIN_ROOT 환경변수와 달리
 * 매 실행마다 디스크에서 새로 읽으므로 터미널/Claude Code 재시작 없이 다음 명령부터 바로 반영된다.
 *
 * 저장 직후 "방금 저장한 그 경로" 자체가 유효한지 tryLoadLive 로 직접 확인한다(loadCoreRuleset()
 * 전체 우선순위가 아니라) — critic 지적(M2): YOHAN_BRAIN_ROOT 가 다른 유효 경로를 가리키면
 * loadCoreRuleset() 은 env 쪽을 먼저 반환하므로, 그걸로 "성공"을 판단하면 방금 저장한 값이
 * 실제로는 아직 안 쓰이는데도 성공했다고 오도할 수 있다.
 */
export async function configSetBrainRoot(brainRootPath: string, homeDir?: string): Promise<void> {
  console.log(chalk.bold(`\n${ko.config.setBrainRootTitle}\n`))

  writeHomeConfig({ brainRoot: brainRootPath }, homeDir)
  console.log(chalk.dim(`  ${ko.config.saved(brainRootPath)}`))

  const saved = tryLoadLive(brainRootPath)
  if (!saved) {
    console.log(chalk.yellow(`\n  ⚠️ ${ko.config.notFoundWarn}`))
    console.log(chalk.dim(`     ${ko.config.notFoundHint(brainRootPath)}`))
    printNextStep({ message: ko.config.nextHint, command: 'vhk context', cursorHint: '헌법 소스 확인해줘' })
    return
  }

  const envRoot = process.env.YOHAN_BRAIN_ROOT
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
