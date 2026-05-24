import { existsSync } from 'node:fs'
import chalk from 'chalk'
import inquirer from 'inquirer'
import { safeExecFile, safeExecFileStream } from '../lib/exec.js'
import { t } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'

export type Platform = 'vercel' | 'netlify' | 'cloudflare'

interface PlatformConfig {
  name: string
  detectFiles: string[]
  command: string
  commandArgs: string[]
  checkArgs: string[]
  installHint: string
}

const PLATFORMS: Record<Platform, PlatformConfig> = {
  vercel: {
    name: 'Vercel',
    detectFiles: ['vercel.json', '.vercel'],
    command: 'vercel',
    commandArgs: ['--prod'],
    checkArgs: ['--version'],
    installHint: 'npm i -g vercel',
  },
  netlify: {
    name: 'Netlify',
    detectFiles: ['netlify.toml', '.netlify'],
    command: 'netlify',
    commandArgs: ['deploy', '--prod'],
    checkArgs: ['--version'],
    installHint: 'npm i -g netlify-cli',
  },
  cloudflare: {
    name: 'Cloudflare Workers',
    detectFiles: ['wrangler.toml'],
    command: 'wrangler',
    commandArgs: ['deploy'],
    checkArgs: ['--version'],
    installHint: 'npm i -g wrangler',
  },
}

export function detectPlatform(): Platform | null {
  for (const [key, config] of Object.entries(PLATFORMS) as [Platform, PlatformConfig][]) {
    for (const file of config.detectFiles) {
      if (existsSync(file)) return key
    }
  }
  return null
}

function isCLIAvailable(cmd: string, checkArgs: string[]): boolean {
  return safeExecFile(cmd, checkArgs).ok
}

export async function deploy(): Promise<void> {
  console.log(chalk.bold('\n🚀 ' + t('deploy.title')))
  console.log(chalk.gray('─'.repeat(40)))

  let platform: Platform | null = detectPlatform()

  if (platform) {
    console.log(chalk.cyan(`\n🔍 감지된 플랫폼: ${PLATFORMS[platform].name}`))
  } else {
    const { selected } = await inquirer.prompt<{ selected: Platform }>([
      {
        type: 'list',
        name: 'selected',
        message: t('deploy.selectPlatform'),
        choices: [
          { name: '▲ Vercel', value: 'vercel' as Platform },
          { name: '◆ Netlify', value: 'netlify' as Platform },
          { name: '☁ Cloudflare Workers', value: 'cloudflare' as Platform },
        ],
      },
    ])
    platform = selected
  }

  const config = PLATFORMS[platform]

  if (!isCLIAvailable(config.command, config.checkArgs)) {
    console.log(chalk.red(`\n❌ ${config.name} CLI가 설치되어 있지 않습니다.`))
    console.log(chalk.yellow(`   → ${config.installHint}`))
    return
  }

  const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
    {
      type: 'confirm',
      name: 'confirm',
      message: `${config.name}에 프로덕션 배포할까요?`,
      default: true,
    },
  ])

  if (!confirm) {
    console.log(chalk.gray('취소됨'))
    return
  }

  // 배포는 시간이 걸리는 작업 — 실시간 로그를 사용자가 볼 수 있도록 stream 모드 사용.
  // ora 스피너는 자식 프로세스 stdout과 충돌하므로 사용 안 함.
  console.log(chalk.cyan(`\n${t('deploy.deploying')}\n`))
  const result = safeExecFileStream(config.command, config.commandArgs)

  if (result.ok) {
    console.log(chalk.green(`\n✅ ${t('deploy.success')}`))
    printNextStep({
      message: '배포 완료! 사이트를 확인하세요.',
      command: 'vhk status',
      cursorHint: '상태 확인해줘',
    })
  } else {
    console.log(chalk.red(`\n❌ ${t('deploy.failed')}`))
    console.log(chalk.red(result.err))
  }
}
