import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import chalk from 'chalk'
import ora from 'ora'
import { t } from '../i18n/ko.js'
import { readJsonFile } from '../lib/read-json.js'
import { safeExecFile } from '../lib/exec.js'
import { printNextStep } from '../lib/next-step.js'

const PACKAGE = '@byh3071/vhk'

function getCurrentVersion(): string {
  const dir = dirname(fileURLToPath(import.meta.url))
  // tsup 번들: dist/index.js → ../package.json
  // 소스 직접 실행: src/commands/update.ts → ../../package.json
  for (const pkgPath of [join(dir, '../package.json'), join(dir, '../../package.json')]) {
    try {
      if (existsSync(pkgPath)) {
        const pkg = readJsonFile<{ version?: string }>(pkgPath)
        if (pkg.version) return pkg.version
      }
    } catch {
      continue
    }
  }
  return '0.0.0'
}

function getLatestVersion(): string | null {
  const r = safeExecFile('npm', ['view', PACKAGE, 'version'])
  return r.ok ? r.out : null
}

/** semver 비교: a >= b면 true (a가 같거나 더 높으면 true) */
function isUpToDate(current: string, latest: string): boolean {
  const parse = (v: string) => v.split('.').map(n => parseInt(n, 10) || 0)
  const [ca, cb, cc] = parse(current)
  const [la, lb, lc] = parse(latest)
  if (ca !== la) return ca > la
  if (cb !== lb) return cb > lb
  return cc >= lc
}

export async function update(): Promise<void> {
  console.log(chalk.bold('\n⬆️  ' + t('update.title')))
  console.log(chalk.gray('─'.repeat(40)))

  const current = getCurrentVersion()
  console.log(chalk.cyan(`\n📌 현재 버전: v${current}`))

  const spinner = ora('최신 버전 확인 중...').start()
  const latest = getLatestVersion()

  if (!latest) {
    spinner.fail('최신 버전을 확인할 수 없습니다.')
    console.log(chalk.yellow('   네트워크를 확인하거나 수동으로 업데이트하세요:'))
    console.log(chalk.gray(`   npm update -g ${PACKAGE}`))
    return
  }

  spinner.stop()
  console.log(chalk.cyan(`🆕 최신 버전: v${latest}`))

  if (isUpToDate(current, latest)) {
    console.log(chalk.green('\n✅ 이미 최신 버전입니다!'))
    return
  }

  const updateSpinner = ora(`v${latest}으로 업데이트 중...`).start()
  const upd = safeExecFile('npm', ['update', '-g', PACKAGE])
  if (upd.ok) {
    updateSpinner.succeed(`v${latest}으로 업데이트 완료!`)
    console.log(chalk.green.bold(`\n🎉 VHK CLI v${latest} 업데이트 완료!`))
    console.log(chalk.gray('   변경 사항은 GitHub Releases를 확인하세요.'))
    printNextStep({
      message: t('update.nextOkMessage'),
      command: 'vhk --version',
      cursorHint: t('update.nextOkCursor'),
    })
  } else {
    updateSpinner.fail('업데이트 실패')
    console.log(chalk.red(upd.err.slice(0, 300)))
    console.log(chalk.yellow('\n수동으로 업데이트하세요:'))
    console.log(chalk.gray(`   npm update -g ${PACKAGE}`))
    printNextStep({
      message: t('update.nextFailMessage'),
      command: 'vhk doctor',
      cursorHint: t('update.nextFailCursor'),
    })
  }
}
