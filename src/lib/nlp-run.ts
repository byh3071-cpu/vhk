import chalk from 'chalk'
import inquirer from 'inquirer'
import { routeNaturalLanguage, extractNotionUrl, type NlpRoute, type NlpCommand } from './nlp-router.js'
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
import { restore } from '../commands/restore.js'
import { status } from '../commands/status.js'
import { diff } from '../commands/diff.js'
import { mcpInit } from '../commands/mcp-init.js'
import { deploy } from '../commands/deploy.js'
import { env, envCheck } from '../commands/env.js'
import { publish } from '../commands/publish.js'
import { design, designPalette } from '../commands/design.js'
import { theme } from '../commands/theme.js'
import { refList } from '../commands/ref.js'
import { harness } from '../commands/harness.js'
import { audit } from '../commands/audit.js'
import { migrate } from '../commands/migrate.js'
import { update } from '../commands/update.js'
import { context, contextShow } from '../commands/context.js'
import { memoryList, memoryMigrate } from '../commands/memory.js'
import { brief } from '../commands/brief.js'
import { start } from '../commands/start.js'
import { goalCheck, goalDone, goalList, goalNext, goalSync } from '../commands/goal.js'
import { cloudPush, cloudPull } from '../commands/cloud.js'
import { quickActions } from '../commands/help.js'
import { mode } from '../commands/mode.js'
import { verify } from '../commands/verify.js'
import { review } from '../commands/review.js'
import { missionShow } from '../commands/mission.js'
import { patternList } from '../commands/pattern.js'
import { runGuarded } from './safety-guard.js'
import { NL_GUARDED_ACTIONS } from './risk-policy.js'

export async function dispatchNlpRoute(route: NlpRoute, input: string): Promise<void> {
  switch (route.command) {
    case 'gate':
      return gate()
    case 'start':
      return start({
        fromNotion: route.args?.includes('--from-notion')
          ? extractNotionUrl(input)
          : undefined,
      })
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
    case 'restore':
      return restore(route.args?.[0])
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
    case 'design':
      return design()
    case 'design-palette':
      return designPalette()
    case 'theme':
      return theme()
    case 'ref':
      return refList()
    case 'harness':
      return harness()
    case 'audit':
      return audit()
    case 'migrate':
      return migrate()
    case 'update':
      return update()
    case 'context':
      return context()
    case 'context-show':
      return contextShow()
    case 'memory':
      if (route.args?.[0] === 'migrate') return memoryMigrate()
      return memoryList()
    case 'brief':
      return brief()
    case 'cloud-push':
      return cloudPush()
    case 'cloud-pull':
      return cloudPull()
    case 'goal': {
      const sub = route.args?.[0]
      if (sub === 'next') return goalNext()
      if (sub === 'check') return goalCheck({})
      if (sub === 'done') return goalDone({})
      if (sub === 'sync') { await goalSync(); return }
      return goalList()
    }
    case 'help':
      return quickActions()
    case 'mode':
      return mode()
    case 'verify':
      return verify()
    case 'review':
      return review()
    case 'mission':
      return missionShow()
    case 'pattern':
      return patternList()
  }
}

/**
 * 상태(파일/git)를 바꾸는 NL 명령 — 자연어 매칭은 오탐이 있을 수 있으므로
 * confidence 가 high 라도 실행 전 반드시 사용자 confirm 을 거친다.
 * (적대 리뷰 HIGH 수정: 자연어 한 마디가 곧장 scaffold/배포 등으로 이어지지 않게.)
 */
const STATE_CHANGING_COMMANDS: ReadonlySet<NlpCommand> = new Set([
  'start', 'init',
])

/** NL 라우트 실행 전 확인 프롬프트가 필요한가 — low confidence 또는 상태변경 명령. */
export function requiresConfirmation(route: NlpRoute): boolean {
  const goalSync = route.command === 'goal' && route.args?.[0] === 'sync'
  return route.confidence === 'low' || STATE_CHANGING_COMMANDS.has(route.command) || goalSync
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

  if (requiresConfirmation(route)) {
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

  // 자연어로 부른 high-risk 작업은 단일 가드(runGuarded) 경유 — 기본 비실행(preview).
  // 자연어는 명시 승인 수단이 없으므로 high-risk 는 실행되지 않고 안내만 한다.
  // (이전 nlSafetyNotice 는 preview 만 찍고 dispatch 로 그대로 실행하던 비차단 버그 — 제거.)
  const riskAction = NL_GUARDED_ACTIONS[route.command]
  if (riskAction) {
    await runGuarded(
      riskAction,
      { channel: 'nl', approved: false, log: (m) => console.log(chalk.yellow(`  ${m}`)) },
      () => dispatchNlpRoute(route, input),
    )
    return
  }

  await dispatchNlpRoute(route, input)
}
