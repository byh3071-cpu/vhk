import { existsSync, readFileSync } from 'node:fs'
import chalk from 'chalk'
import { prompt } from '../lib/prompt.js'
import { safeExecFile, safeExecFileStream } from '../lib/exec.js'
import { readJsonFile } from '../lib/read-json.js'
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

// #152: Cloudflare 는 Workers/Pages 둘 다 wrangler.toml 을 쓴다 — 무조건 Workers 로 보면
// Pages 프로젝트에 `wrangler deploy`(틀린 명령)를 제시. toml 의 pages 표식 또는 deploy
// 스크립트의 `wrangler pages deploy` 로 Pages 를 식별. (순수 함수 — 내용만 받아 fs 무관)
export function isCloudflarePages(
  tomlContent: string | null,
  scripts: Record<string, string> = {}
): boolean {
  // #219: unanchored substring 은 주석·값의 'pages' 도 잡아 Workers 를 오분류했다.
  //        줄 단위로 보고 (a) 주석(#) 무시, (b) 섹션 헤더 [pages]/[[pages]] 또는
  //        (c) 줄 시작 키 pages_build_output_dir = ... 만 Pages 신호로 인정.
  if (tomlContent) {
    for (const raw of tomlContent.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      if (/^\[\[?\s*pages\b/i.test(line)) return true
      if (/^pages_build_output_dir\s*=/i.test(line)) return true
    }
  }
  return Object.values(scripts).some((s) => /wrangler\s+pages\s+deploy/.test(s))
}

// #152: Cloudflare 배포 설정 해석 — Pages/Workers 구분 + `npx wrangler`(전역 미설치 대응).
export function cloudflareDeployConfig(
  tomlContent: string | null,
  scripts: Record<string, string> = {}
): PlatformConfig {
  const pages = isCloudflarePages(tomlContent, scripts)
  return {
    name: pages ? 'Cloudflare Pages' : 'Cloudflare Workers',
    detectFiles: ['wrangler.toml'],
    command: 'npx',
    commandArgs: pages ? ['wrangler', 'pages', 'deploy'] : ['wrangler', 'deploy'],
    checkArgs: ['wrangler', '--version'],
    installHint: 'npx 가 wrangler 를 자동 설치합니다 (또는 npm i -D wrangler)',
  }
}

// wrangler.toml 내용 읽기 — 가드(존재+읽기 try/catch) 단일화. 부재/읽기실패 → null(TOCTOU 안전).
function readWranglerToml(): string | null {
  try {
    return existsSync('wrangler.toml') ? readFileSync('wrangler.toml', 'utf-8') : null
  } catch {
    return null
  }
}

function readPkgScripts(): Record<string, string> {
  try {
    return readJsonFile<{ scripts?: Record<string, string> }>('package.json').scripts ?? {}
  } catch {
    return {}
  }
}

// #152: CLI/MCP 공용 배포 타깃 해석 — 감지 + Cloudflare Pages/Workers 세분(통일된 단일 출처).
export function resolveDeployTarget(): { platform: Platform; config: PlatformConfig } | null {
  const platform = detectPlatform()
  if (!platform) return null
  if (platform === 'cloudflare') {
    return { platform, config: cloudflareDeployConfig(readWranglerToml(), readPkgScripts()) }
  }
  return { platform, config: PLATFORMS[platform] }
}

function isCLIAvailable(cmd: string, checkArgs: string[]): boolean {
  return safeExecFile(cmd, checkArgs).ok
}

export async function deploy(): Promise<void> {
  console.log(chalk.bold('\n🚀 ' + t('deploy.title')))
  console.log(chalk.gray('─'.repeat(40)))

  const target = resolveDeployTarget()
  let config: PlatformConfig

  if (target) {
    config = target.config
    console.log(chalk.cyan(`\n🔍 감지된 플랫폼: ${config.name}`))
  } else {
    const { selected } = await prompt<{ selected: Platform }>([
      {
        type: 'list',
        name: 'selected',
        message: t('deploy.selectPlatform'),
        choices: [
          { name: '▲ Vercel', value: 'vercel' as Platform },
          { name: '◆ Netlify', value: 'netlify' as Platform },
          { name: '☁ Cloudflare (Workers/Pages 자동 구분)', value: 'cloudflare' as Platform },
        ],
      },
    ])
    // #152: Cloudflare 수동 선택 시에도 Pages/Workers 세분 + npx.
    config =
      selected === 'cloudflare'
        ? cloudflareDeployConfig(readWranglerToml(), readPkgScripts())
        : PLATFORMS[selected]
  }

  if (!isCLIAvailable(config.command, config.checkArgs)) {
    console.log(chalk.red(`\n❌ ${config.name} CLI가 설치되어 있지 않습니다.`))
    console.log(chalk.yellow(`   → ${config.installHint}`))
    return
  }

  const { confirm } = await prompt<{ confirm: boolean }>([
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
