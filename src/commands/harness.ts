import { existsSync } from 'node:fs'
import chalk from 'chalk'
import ora from 'ora'
import { t } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { safeExecFile } from '../lib/exec.js'
import { readJsonFile } from '../lib/read-json.js'

type CheckSpec = { name: string; bin: string; args: string[] }

interface CheckResult {
  name: string
  command: string
  passed: boolean
  duration: number
  error?: string
}

function detectPM(): 'pnpm' | 'yarn' | 'npm' {
  if (existsSync('pnpm-lock.yaml')) return 'pnpm'
  if (existsSync('yarn.lock')) return 'yarn'
  return 'npm'
}

function pmRun(pm: string, script: string): string[] {
  // npm은 `npm run <script>`, pnpm/yarn은 `<pm> <script>` 단축 지원하지만 안전상 run 사용.
  return pm === 'npm' ? ['run', script] : [script]
}

function detectChecks(): CheckSpec[] {
  const checks: CheckSpec[] = []
  let pkg: { scripts?: Record<string, string> } = {}
  try {
    pkg = readJsonFile<{ scripts?: Record<string, string> }>('package.json')
  } catch {
    return checks
  }
  const s = pkg.scripts ?? {}
  const pm = detectPM()

  if (s.lint) {
    checks.push({ name: 'lint', bin: pm, args: pmRun(pm, 'lint') })
  } else if (
    existsSync('.eslintrc.js') ||
    existsSync('.eslintrc.json') ||
    existsSync('eslint.config.js')
  ) {
    checks.push({ name: 'lint', bin: 'npx', args: ['eslint', '.', '--ext', '.ts,.tsx'] })
  }

  if (s['type-check']) {
    checks.push({ name: 'type-check', bin: pm, args: pmRun(pm, 'type-check') })
  } else if (s.typecheck) {
    checks.push({ name: 'type-check', bin: pm, args: pmRun(pm, 'typecheck') })
  } else if (existsSync('tsconfig.json')) {
    checks.push({ name: 'type-check', bin: 'npx', args: ['tsc', '--noEmit'] })
  }

  if (s.test) {
    // vitest --run 등 사용자가 추가 옵션 없이 동작하도록 script 호출만.
    checks.push({ name: 'test', bin: pm, args: pmRun(pm, 'test') })
  }
  if (s.build) {
    checks.push({ name: 'build', bin: pm, args: pmRun(pm, 'build') })
  }

  return checks
}

export async function harness(): Promise<void> {
  console.log(chalk.bold('\n🔧 ' + t('harness.title')))
  console.log(chalk.gray('─'.repeat(40)))

  const checks = detectChecks()

  if (checks.length === 0) {
    console.log(chalk.yellow('\n⚠️  실행할 수 있는 스크립트가 없습니다.'))
    console.log(chalk.gray('   package.json에 lint, test, build 스크립트를 추가해주세요.'))
    return
  }

  console.log(chalk.cyan(`\n🏃 ${checks.length}개 점검 시작:\n`))

  const results: CheckResult[] = []

  for (const check of checks) {
    const display = `${check.bin} ${check.args.join(' ')}`
    const spinner = ora(`${check.name} 실행 중...`).start()
    const start = Date.now()
    const result = safeExecFile(check.bin, check.args)
    const duration = Date.now() - start
    const sec = (duration / 1000).toFixed(1)
    if (result.ok) {
      spinner.succeed(`${check.name} ${chalk.gray(`(${sec}s)`)}`)
      results.push({ name: check.name, command: display, passed: true, duration })
    } else {
      spinner.fail(`${check.name} ${chalk.gray(`(${sec}s)`)}`)
      results.push({
        name: check.name,
        command: display,
        passed: false,
        duration,
        error: result.err.slice(0, 200),
      })
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
    // 하위 점검 ≥1 실패 → 비-0 종료(CI/pre-push 게이트가 실제로 막게). VHK-010.
    process.exitCode = 1
  }

  printNextStep({
    message: all ? '품질 점검 통과!' : '실패 항목을 수정하세요.',
    command: all ? 'vhk ship' : 'vhk doctor',
    cursorHint: all ? '배포해줘' : '문제 진단해줘',
  })
}
