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
import { memoryList } from '../commands/memory.js'
import { brief } from '../commands/brief.js'
import { start } from '../commands/start.js'
import { goalCheck, goalDone, goalList, goalNext } from '../commands/goal.js'
import { cloudPush, cloudPull } from '../commands/cloud.js'
import { quickActions } from '../commands/help.js'
import { mode } from '../commands/mode.js'
import { verify } from '../commands/verify.js'
import { readConfig } from './config.js'
import { resolveGuard } from './risk-policy.js'
import type { SafetyMode } from './safety-mode.js'

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
      return goalList()
    }
    case 'help':
      return quickActions()
    case 'mode':
      return mode()
    case 'verify':
      return verify()
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
  return route.confidence === 'low' || STATE_CHANGING_COMMANDS.has(route.command)
}

/** 자연어 명령 → high-risk 액션(risk-policy) 매핑. 자연어로 부를 수 있는 위험 작업만. */
const NL_RISK_ACTION: Partial<Record<NlpCommand, string>> = {
  undo: 'undo',
  deploy: 'deploy',
  publish: 'publish',
  migrate: 'migrate',
  'cloud-pull': 'cloud-pull',
}

/**
 * 자연어로 high-risk 작업을 부를 때 Safety Mode 에 따른 안내 문구.
 * 자연어 채널은 confirm 대신 preview(무엇을 할지 안내) — 에이전트/자연어의 "그냥 실행" 방지.
 * 저위험이면 null.
 */
export function nlSafetyNotice(command: NlpCommand, mode: SafetyMode): string | null {
  const action = NL_RISK_ACTION[command]
  if (!action) return null
  const guard = resolveGuard(action, mode, 'nl')
  if (guard === 'warn') {
    return `⚠️ 위험 작업(${action}) — lite 모드라 경고만 하고 진행합니다.`
  }
  if (guard === 'preview') {
    return `🔎 위험 작업(${action}) 미리보기 — 실행 전 무엇을 할지 확인하세요. (Safety Mode: ${mode})`
  }
  return null
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
  // 자연어로 부른 high-risk 작업은 Safety Mode 에 따라 preview/경고를 먼저 보여준다.
  const notice = nlSafetyNotice(route.command, readConfig().safetyMode)
  if (notice) console.log(chalk.yellow(`  ${notice}`))

  console.log('')

  await dispatchNlpRoute(route, input)
}
