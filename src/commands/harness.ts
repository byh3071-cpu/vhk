import { existsSync } from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'
import ora from 'ora'
import { t } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { safeExecFile } from '../lib/exec.js'
import { ensureNotHardStopped } from '../lib/hard-stop-guard.js'
import { discoverProjects, type DiscoveredProject } from '../lib/workspaces.js'

type CheckSpec = { name: string; bin: string; args: string[]; cwd: string; project: string }

interface CheckResult {
  name: string
  project: string
  command: string
  passed: boolean
  duration: number
  error?: string
}

type PM = 'pnpm' | 'yarn' | 'npm'

function rootPM(): PM {
  if (existsSync('pnpm-lock.yaml')) return 'pnpm'
  if (existsSync('yarn.lock')) return 'yarn'
  return 'npm'
}

// #171: 프로젝트 디렉터리별 PM 감지. 중첩 패키지에 락파일이 없으면 루트 PM 으로 폴백(워크스페이스 관례).
function detectPMIn(dir: string, fallback: PM): PM {
  if (existsSync(join(dir, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(dir, 'yarn.lock'))) return 'yarn'
  if (existsSync(join(dir, 'package-lock.json'))) return 'npm'
  return fallback
}

function pmRun(pm: string, script: string): string[] {
  // npm은 `npm run <script>`, pnpm/yarn은 `<pm> <script>` 단축 지원하지만 안전상 run 사용.
  return pm === 'npm' ? ['run', script] : [script]
}

// #171: 한 프로젝트(루트 또는 중첩)의 점검 목록 — 해당 디렉터리 기준으로 cwd 부여.
function detectChecksForProject(root: string, project: DiscoveredProject, fallbackPM: PM): CheckSpec[] {
  const checks: CheckSpec[] = []
  const dir = join(root, project.path)
  const s = project.scripts
  const pm = detectPMIn(dir, fallbackPM)
  const has = (f: string): boolean => existsSync(join(dir, f))
  const push = (name: string, bin: string, args: string[]): void => {
    checks.push({ name, bin, args, cwd: dir, project: project.path })
  }

  if (s.lint) {
    push('lint', pm, pmRun(pm, 'lint'))
  } else if (has('.eslintrc.js') || has('.eslintrc.json') || has('eslint.config.js')) {
    push('lint', 'npx', ['eslint', '.', '--ext', '.ts,.tsx'])
  }

  if (s['type-check']) {
    push('type-check', pm, pmRun(pm, 'type-check'))
  } else if (s.typecheck) {
    push('type-check', pm, pmRun(pm, 'typecheck'))
  } else if (has('tsconfig.json')) {
    push('type-check', 'npx', ['tsc', '--noEmit'])
  }

  // #156: 풍부한 게이트 우선 — test:gate → test:ci → test 순으로 첫 존재 스크립트 1개만.
  const testScript = ['test:gate', 'test:ci', 'test'].find((name) => s[name])
  if (testScript) {
    push(testScript, pm, pmRun(pm, testScript))
  }
  if (s.build) {
    push('build', pm, pmRun(pm, 'build'))
  }

  return checks
}

export async function harness(): Promise<void> {
  if (!ensureNotHardStopped('harness')) return // VHK-020
  console.log(chalk.bold('\n🔧 ' + t('harness.title')))
  console.log(chalk.gray('─'.repeat(40)))

  // #171: 루트 + 중첩 패키지를 모두 점검 대상으로 (이전엔 루트 package.json 만 봄).
  const projects = discoverProjects('.')
  const fallbackPM = rootPM()
  const checks = projects.flatMap((p) => detectChecksForProject('.', p, fallbackPM))
  const multi = projects.length > 1

  if (checks.length === 0) {
    console.log(chalk.yellow('\n⚠️  실행할 수 있는 스크립트가 없습니다.'))
    console.log(chalk.gray('   package.json에 lint, test, build 스크립트를 추가해주세요.'))
    if (multi) {
      console.log(chalk.gray(`   (점검 대상 ${projects.length}개: ${projects.map((p) => p.path).join(', ')})`))
    }
    return
  }

  if (multi) {
    console.log(chalk.cyan(`\n📦 프로젝트 ${projects.length}개: ${projects.map((p) => p.path).join(', ')}`))
  }
  console.log(chalk.cyan(`\n🏃 ${checks.length}개 점검 시작:\n`))

  const results: CheckResult[] = []

  for (const check of checks) {
    const label = multi ? `${check.project} › ${check.name}` : check.name
    const display = `${check.bin} ${check.args.join(' ')}`
    const spinner = ora(`${label} 실행 중...`).start()
    const start = Date.now()
    const result = safeExecFile(check.bin, check.args, { cwd: check.cwd })
    const duration = Date.now() - start
    const sec = (duration / 1000).toFixed(1)
    if (result.ok) {
      spinner.succeed(`${label} ${chalk.gray(`(${sec}s)`)}`)
      results.push({ name: check.name, project: check.project, command: display, passed: true, duration })
    } else {
      spinner.fail(`${label} ${chalk.gray(`(${sec}s)`)}`)
      results.push({
        name: check.name,
        project: check.project,
        command: display,
        passed: false,
        duration,
        error: result.err.slice(0, 200),
      })
    }
  }

  console.log(chalk.bold('\n📊 통합 리포트:'))
  console.log(chalk.gray('─'.repeat(40)))
  let lastProject = ''
  for (const r of results) {
    if (multi && r.project !== lastProject) {
      console.log(chalk.bold(`  📦 ${r.project}`))
      lastProject = r.project
    }
    const icon = r.passed ? chalk.green('✅') : chalk.red('❌')
    const sec = (r.duration / 1000).toFixed(1)
    const indent = multi ? '    ' : '  '
    console.log(`${indent}${icon} ${r.name.padEnd(15)} ${chalk.gray(`${sec}s`)}`)
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
