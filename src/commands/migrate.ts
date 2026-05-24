import { execSync } from 'node:child_process'
import { existsSync, unlinkSync, rmSync } from 'node:fs'
import chalk from 'chalk'
import inquirer from 'inquirer'
import ora from 'ora'
import { t } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'

type PackageManager = 'npm' | 'yarn' | 'pnpm'

const LOCK_FILES: Record<PackageManager, string> = {
  npm: 'package-lock.json',
  yarn: 'yarn.lock',
  pnpm: 'pnpm-lock.yaml',
}

function detectCurrentPM(): PackageManager | null {
  if (existsSync('pnpm-lock.yaml')) return 'pnpm'
  if (existsSync('yarn.lock')) return 'yarn'
  if (existsSync('package-lock.json')) return 'npm'
  return null
}

function isCLIAvailable(pm: PackageManager): boolean {
  try {
    execSync(`${pm} --version`, { stdio: ['pipe', 'pipe', 'pipe'] })
    return true
  } catch {
    return false
  }
}

export async function migrate(target?: string): Promise<void> {
  console.log(chalk.bold('\n🔄 ' + t('migrate.title')))
  console.log(chalk.gray('─'.repeat(40)))

  const current = detectCurrentPM()
  console.log(chalk.cyan(`\n현재 패키지 매니저: ${current ?? '감지 불가'}`))

  let targetPM: PackageManager
  if (target && (['npm', 'yarn', 'pnpm'] as const).includes(target as PackageManager)) {
    targetPM = target as PackageManager
  } else {
    const choices = (['npm', 'yarn', 'pnpm'] as PackageManager[])
      .filter((pm) => pm !== current)
      .map((pm) => ({ name: pm, value: pm }))
    const { selected } = await inquirer.prompt<{ selected: PackageManager }>([
      {
        type: 'list',
        name: 'selected',
        message: t('migrate.selectTarget'),
        choices,
      },
    ])
    targetPM = selected
  }

  if (targetPM === current) {
    console.log(chalk.yellow(`\n⚠️  이미 ${targetPM}을 사용 중입니다.`))
    return
  }

  if (!isCLIAvailable(targetPM)) {
    console.log(chalk.red(`\n❌ ${targetPM}이 설치되어 있지 않습니다.`))
    console.log(chalk.yellow(`   npm i -g ${targetPM}`))
    return
  }

  const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
    {
      type: 'confirm',
      name: 'confirm',
      message: `${current ?? '현재'} → ${targetPM}으로 전환할까요? (node_modules 재설치)`,
      default: true,
    },
  ])

  if (!confirm) {
    console.log(chalk.gray('취소됨'))
    return
  }

  const cleanup = ora('기존 lock 파일 정리 중...').start()
  for (const lockFile of Object.values(LOCK_FILES)) {
    if (existsSync(lockFile)) {
      unlinkSync(lockFile)
    }
  }
  if (existsSync('node_modules')) {
    cleanup.text = 'node_modules 삭제 중...'
    rmSync('node_modules', { recursive: true, force: true })
  }
  cleanup.succeed('기존 파일 정리 완료')

  const install = ora(`${targetPM} install 실행 중...`).start()
  try {
    execSync(`${targetPM} install`, { stdio: ['pipe', 'pipe', 'pipe'] })
    install.succeed(`${targetPM} install 완료!`)
  } catch (err) {
    install.fail(`${targetPM} install 실패`)
    const msg = err instanceof Error ? err.message.slice(0, 300) : String(err)
    console.log(chalk.red(msg))
    return
  }

  console.log(chalk.green.bold(`\n🎉 ${current ?? '이전'} → ${targetPM} 전환 완료!`))

  printNextStep({
    message: '패키지 매니저 전환 완료!',
    command: 'vhk harness',
    cursorHint: '품질 점검해줘',
  })
}
