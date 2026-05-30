import chalk from 'chalk'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { printNextStep } from '../lib/next-step.js'
import { ko } from '../i18n/ko.js'
import { readJsonFile } from '../lib/read-json.js'
import { safeExecFile } from '../lib/exec.js'
import { checkRuleDrift, checkContextDrift } from '../lib/drift.js'

export interface CheckResult {
  name: string
  command: string
  version?: string
  ok: boolean
  hint: string
}

export function checkCommand(name: string, command: string, hint: string): CheckResult {
  const result = safeExecFile(command, ['--version'])
  if (!result.ok) return { name, command, ok: false, hint }
  const version = result.out.split('\n')[0]
  return { name, command, version, ok: true, hint }
}

function getVhkVersion(): string | undefined {
  const dir = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.join(dir, '../package.json'),
    path.join(dir, '../../package.json'),
  ]

  for (const pkgPath of candidates) {
    try {
      if (fs.existsSync(pkgPath)) {
        const pkg = readJsonFile<{ version?: string }>(pkgPath)
        return pkg.version
      }
    } catch {
      continue
    }
  }
  return undefined
}

export function fetchLatestNpmVersion(packageName: string): string | undefined {
  // safeExecFile 은 argv 분리 (packageName 의 shell metachar 인젝션 차단).
  // timeout 옵션은 미지원 — npm view 는 일반적으로 빠르나 네트워크 장애 시 hang 가능.
  // 필요 시 lib/exec 에 timeout 추가 검토.
  const result = safeExecFile('npm', ['view', packageName, 'version'])
  if (!result.ok) return undefined
  const out = result.out
  if (/^\d+\.\d+\.\d+/.test(out)) return out
  return undefined
}

export function compareSemver(a: string, b: string): number {
  const parse = (v: string) =>
    v.replace(/^v/i, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0)
  const [a1 = 0, a2 = 0, a3 = 0] = parse(a)
  const [b1 = 0, b2 = 0, b3 = 0] = parse(b)
  if (a1 !== b1) return a1 - b1
  if (a2 !== b2) return a2 - b2
  return a3 - b3
}

export async function doctor() {
  console.log(chalk.bold(`\n${ko.doctor.title}\n`))

  const checks: CheckResult[] = [
    checkCommand('Node.js', 'node', '설치: https://nodejs.org (LTS 권장)'),
    checkCommand('npm', 'npm', 'Node.js 설치 시 함께 설치됩니다'),
    checkCommand('pnpm', 'pnpm', '설치: npm i -g pnpm'),
    checkCommand('Git', 'git', '설치: https://git-scm.com'),
  ]

  let allOk = true

  for (const check of checks) {
    if (check.ok) {
      console.log(chalk.green(`  ✅ ${check.name}`) + chalk.dim(` — ${check.version}`))
    } else {
      console.log(chalk.red(`  ❌ ${check.name} 없음`))
      console.log(chalk.dim(`     → ${check.hint}`))
      allOk = false
    }
  }

  console.log('')
  const vhkVersion = getVhkVersion()
  if (vhkVersion) {
    console.log(chalk.green('  ✅ VHK') + chalk.dim(` — v${vhkVersion}`))
  } else {
    console.log(chalk.green('  ✅ VHK') + chalk.dim(' — 설치됨'))
  }

  if (vhkVersion) {
    const latest = fetchLatestNpmVersion('@byh3071/vhk')
    if (latest && compareSemver(latest, vhkVersion) > 0) {
      console.log(chalk.yellow(`  ${ko.doctor.updateAvailable(latest)}`))
    } else if (latest) {
      console.log(chalk.dim(`     ${ko.doctor.updateCurrent}`))
    }
  }

  console.log('')
  console.log(chalk.bold(`  ${ko.doctor.projectFiles}`))

  const cwd = process.cwd()

  const projectFiles = [
    { name: 'RULES.md', hint: 'vhk init으로 생성 가능' },
    { name: 'COMMANDS.md', hint: 'vhk init으로 생성 가능' },
    { name: 'package.json', hint: '프로젝트 폴더에서 실행하세요' },
    { name: '.gitignore', hint: '보안을 위해 추가 권장' },
    { name: '.env', hint: '.gitignore에 포함되어 있는지 확인' },
  ]

  for (const file of projectFiles) {
    const exists = fs.existsSync(path.join(cwd, file.name))
    if (exists) {
      console.log(chalk.green(`    ✅ ${file.name}`))
      if (file.name === '.env') {
        const gitignorePath = path.join(cwd, '.gitignore')
        if (fs.existsSync(gitignorePath)) {
          const gitignore = fs.readFileSync(gitignorePath, 'utf-8')
          if (!gitignore.includes('.env')) {
            console.log(chalk.yellow(`    ${ko.doctor.envNotIgnored}`))
          }
        }
      }
    } else {
      console.log(chalk.dim(`    ⬚ ${file.name}`) + chalk.dim(` — ${file.hint}`))
    }
  }

  // 드리프트 점검 (passive — doctor 안에서 자동 경고, 읽기 전용)
  console.log('')
  console.log(chalk.bold(`  ${ko.doctor.driftTitle}`))
  const ruleDrift = checkRuleDrift(cwd)
  if (!ruleDrift.checked) {
    console.log(chalk.dim(`    ${ko.doctor.driftNoRules}`))
  } else {
    const drifted = ruleDrift.results.filter(r => r.status === 'drifted')
    if (drifted.length === 0) {
      console.log(chalk.green(`    ${ko.doctor.driftRuleClean}`))
    } else {
      console.log(chalk.yellow(`    ${ko.doctor.driftRuleWarn(drifted.map(d => d.path).join(', '))}`))
    }
  }
  const ctxDrift = checkContextDrift(cwd)
  if (ctxDrift.checked && ctxDrift.stale) {
    console.log(chalk.yellow(`    ${ko.doctor.driftContextWarn}`))
  }

  console.log('')
  if (allOk) {
    console.log(chalk.green.bold(`  ${ko.doctor.allOk}`))
    printNextStep({
      message: ko.doctor.nextOkMessage,
      command: 'vhk 시작',
      cursorHint: '프로젝트 만들어줘',
    })
  } else {
    console.log(chalk.yellow.bold(`  ${ko.doctor.missing} ${ko.doctor.missingHint}`))
    printNextStep({
      message: ko.doctor.nextRetryMessage,
      command: 'vhk doctor',
      cursorHint: '환경 다시 점검해줘',
    })
    process.exitCode = 1
  }
}
