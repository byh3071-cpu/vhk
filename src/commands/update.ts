import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import chalk from 'chalk'
import ora from 'ora'
import { t } from '../i18n/ko.js'

const PACKAGE = '@byh3071/vhk'

function getCurrentVersion(): string {
  const dir = dirname(fileURLToPath(import.meta.url))
  // tsup 번들: dist/index.js → ../package.json
  // 소스 직접 실행: src/commands/update.ts → ../../package.json
  for (const pkgPath of [join(dir, '../package.json'), join(dir, '../../package.json')]) {
    try {
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string }
        if (pkg.version) return pkg.version
      }
    } catch {
      continue
    }
  }
  return '0.0.0'
}

function getLatestVersion(): string | null {
  try {
    const out = execSync(`npm view ${PACKAGE} version`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString()
    return out.trim()
  } catch {
    return null
  }
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
  try {
    execSync(`npm update -g ${PACKAGE}`, { stdio: ['pipe', 'pipe', 'pipe'] })
    updateSpinner.succeed(`v${latest}으로 업데이트 완료!`)
    console.log(chalk.green.bold(`\n🎉 VHK CLI v${latest} 업데이트 완료!`))
    console.log(chalk.gray('   변경 사항은 GitHub Releases를 확인하세요.'))
  } catch (err) {
    updateSpinner.fail('업데이트 실패')
    const msg = err instanceof Error ? err.message.slice(0, 300) : String(err)
    console.log(chalk.red(msg))
    console.log(chalk.yellow('\n수동으로 업데이트하세요:'))
    console.log(chalk.gray(`   npm update -g ${PACKAGE}`))
  }
}
