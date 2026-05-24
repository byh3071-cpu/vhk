import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import chalk from 'chalk'
import ora from 'ora'
import { t } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'

interface CheckResult {
  name: string
  command: string
  passed: boolean
  duration: number
  error?: string
}

function detectScripts(): Record<string, string> {
  const scripts: Record<string, string> = {}
  try {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8')) as {
      scripts?: Record<string, string>
    }
    const s = pkg.scripts ?? {}

    if (s.lint) scripts.lint = 'pnpm lint'
    else if (
      existsSync('.eslintrc.js') ||
      existsSync('.eslintrc.json') ||
      existsSync('eslint.config.js')
    )
      scripts.lint = 'npx eslint . --ext .ts,.tsx'

    if (s['type-check']) scripts['type-check'] = 'pnpm type-check'
    else if (s.typecheck) scripts['type-check'] = 'pnpm typecheck'
    else if (existsSync('tsconfig.json')) scripts['type-check'] = 'npx tsc --noEmit'

    if (s.test) scripts.test = 'pnpm test --run'
    if (s.build) scripts.build = 'pnpm build'
  } catch {
    // package.json 없거나 파싱 실패
  }
  return scripts
}

export async function harness(): Promise<void> {
  console.log(chalk.bold('\n🔧 ' + t('harness.title')))
  console.log(chalk.gray('─'.repeat(40)))

  const scripts = detectScripts()
  const names = Object.keys(scripts)

  if (names.length === 0) {
    console.log(chalk.yellow('\n⚠️  실행할 수 있는 스크립트가 없습니다.'))
    console.log(chalk.gray('   package.json에 lint, test, build 스크립트를 추가해주세요.'))
    return
  }

  console.log(chalk.cyan(`\n🏃 ${names.length}개 점검 시작:\n`))

  const results: CheckResult[] = []

  for (const [name, command] of Object.entries(scripts)) {
    const spinner = ora(`${name} 실행 중...`).start()
    const start = Date.now()
    try {
      execSync(command, {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 120_000,
      })
      const duration = Date.now() - start
      const sec = (duration / 1000).toFixed(1)
      spinner.succeed(`${name} ${chalk.gray(`(${sec}s)`)}`)
      results.push({ name, command, passed: true, duration })
    } catch (err) {
      const duration = Date.now() - start
      const sec = (duration / 1000).toFixed(1)
      spinner.fail(`${name} ${chalk.gray(`(${sec}s)`)}`)
      const msg = err instanceof Error ? err.message.slice(0, 200) : String(err)
      results.push({ name, command, passed: false, duration, error: msg })
    }
  }

  console.log(chalk.bold('\n📊 통합 리포트:'))
  console.log(chalk.gray('─'.repeat(40)))
  for (const r of results) {
    const icon = r.passed ? chalk.green('✅') : chalk.red('❌')
    const sec = (r.duration / 1000).toFixed(1)
    console.log(`  ${icon} ${r.name.padEnd(15)} ${chalk.gray(`${sec}s`)}`)
  }

  const passed = results.filter((r) => r.passed).length
  const all = passed === results.length
  console.log(chalk.gray('─'.repeat(40)))
  if (all) {
    console.log(chalk.green.bold(`\n🎉 전체 통과! (${passed}/${results.length})`))
  } else {
    console.log(
      chalk.red.bold(`\n⚠️  ${results.length - passed}개 실패 (${passed}/${results.length} 통과)`)
    )
  }

  printNextStep({
    message: all ? '품질 점검 통과!' : '실패 항목을 수정하세요.',
    command: all ? 'vhk ship' : 'vhk doctor',
    cursorHint: all ? '배포해줘' : '문제 진단해줘',
  })
}
