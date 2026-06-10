import { existsSync } from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'
import { prompt } from '../lib/prompt.js'
import { promptOrDefault } from '../lib/interactive.js'
import ora from 'ora'
import { t } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { safeExecFile } from '../lib/exec.js'
import { discoverProjects } from '../lib/workspaces.js'

export type PackageManager = 'npm' | 'yarn' | 'pnpm'

export interface AuditSummary {
  critical: number
  high: number
  moderate: number
  low: number
  total: number
}

export function detectCurrentPM(): PackageManager {
  if (existsSync('pnpm-lock.yaml')) return 'pnpm'
  if (existsSync('yarn.lock')) return 'yarn'
  return 'npm'
}

// #171: 프로젝트 디렉터리별 PM 감지(중첩 패키지). 락파일 없으면 fallback.
function detectPMForDir(dir: string, fallback: PackageManager): PackageManager {
  if (existsSync(join(dir, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(dir, 'yarn.lock'))) return 'yarn'
  if (existsSync(join(dir, 'package-lock.json'))) return 'npm'
  return fallback
}

export function parseAuditOutput(output: string, pm: PackageManager): AuditSummary {
  const empty: AuditSummary = { critical: 0, high: 0, moderate: 0, low: 0, total: 0 }
  if (!output) return empty
  try {
    const json = JSON.parse(output) as Record<string, unknown>
    // npm / yarn classic: { metadata: { vulnerabilities: {...} } }
    // pnpm: 동일한 npm-compat 출력. yarn berry: { advisories: {...} }.
    const meta = (json.metadata as { vulnerabilities?: Partial<AuditSummary> } | undefined)
      ?.vulnerabilities
    if (meta) {
      const summary = {
        critical: meta.critical ?? 0,
        high: meta.high ?? 0,
        moderate: meta.moderate ?? 0,
        low: meta.low ?? 0,
        total: meta.total ?? 0,
      }
      if (!summary.total) {
        summary.total = summary.critical + summary.high + summary.moderate + summary.low
      }
      return summary
    }
    void pm
    return empty
  } catch {
    return empty
  }
}

export function runAuditJson(pm: PackageManager, cwd?: string): string {
  // 취약점 발견 시 exit code !=0지만 stdout에 JSON 출력. safeExecFile은 err 경로에서도 out 반환.
  const result = safeExecFile(pm, ['audit', '--json'], cwd ? { cwd } : {})
  return result.out
}

function runAuditFix(pm: PackageManager, cwd?: string): { ok: boolean; err?: string } {
  // pnpm/yarn classic 은 audit fix 미지원 → npm만 자동 fix.
  if (pm !== 'npm') {
    return { ok: false, err: `${pm}은 자동 fix를 지원하지 않습니다. npm 환경에서만 동작합니다.` }
  }
  const result = safeExecFile('npm', ['audit', 'fix'], cwd ? { cwd } : {})
  return result.ok ? { ok: true } : { ok: false, err: result.err }
}

const addSummary = (a: AuditSummary, b: AuditSummary): AuditSummary => ({
  critical: a.critical + b.critical,
  high: a.high + b.high,
  moderate: a.moderate + b.moderate,
  low: a.low + b.low,
  total: a.total + b.total,
})

function printSummary(summary: AuditSummary, indent = '  '): void {
  if (summary.critical > 0) console.log(chalk.red(`${indent}🔴 Critical: ${summary.critical}`))
  if (summary.high > 0) console.log(chalk.red(`${indent}🟠 High: ${summary.high}`))
  if (summary.moderate > 0) console.log(chalk.yellow(`${indent}🟡 Moderate: ${summary.moderate}`))
  if (summary.low > 0) console.log(chalk.gray(`${indent}⚪ Low: ${summary.low}`))
}

export async function audit(autoFix = false): Promise<void> {
  console.log(chalk.bold('\n🛡️  ' + t('audit.title')))
  console.log(chalk.gray('─'.repeat(40)))

  // #171: 루트 + 중첩 패키지를 모두 감사. discoverProjects 가 비면(package.json 못 읽는 환경) 루트 cwd 폴백.
  const discovered = discoverProjects('.')
  const targets = discovered.length > 0 ? discovered : [{ path: '.', name: '.', scripts: {} }]
  const multi = targets.length > 1
  const rootPm = detectCurrentPM()

  const perProject: { path: string; pm: PackageManager; summary: AuditSummary }[] = []
  let aggregate: AuditSummary = { critical: 0, high: 0, moderate: 0, low: 0, total: 0 }

  for (const tgt of targets) {
    const dir = join('.', tgt.path)
    const pm = detectPMForDir(dir, rootPm)
    const spinner = ora(`${multi ? tgt.path + ' ' : ''}보안 감사 실행 중...`).start()
    const output = runAuditJson(pm, tgt.path === '.' ? undefined : dir)
    spinner.stop()
    const summary = parseAuditOutput(output, pm)
    perProject.push({ path: tgt.path, pm, summary })
    aggregate = addSummary(aggregate, summary)
  }

  if (!multi) {
    console.log(chalk.cyan(`📦 패키지 매니저: ${perProject[0].pm}`))
  }

  if (aggregate.total === 0) {
    console.log(chalk.green.bold('\n🎉 취약점이 발견되지 않았습니다!'))
    if (multi) {
      console.log(chalk.gray(`   (점검 ${targets.length}개: ${targets.map((p) => p.path).join(', ')})`))
    }
    return
  }

  console.log(chalk.bold('\n📊 취약점 요약:'))
  if (multi) {
    for (const p of perProject) {
      if (p.summary.total === 0) continue
      console.log(chalk.bold(`  📦 ${p.path} (${p.pm}) — 총 ${p.summary.total}`))
      printSummary(p.summary, '    ')
    }
    console.log(chalk.bold(`\n  합계 ${aggregate.total}개의 취약점`))
  } else {
    printSummary(aggregate)
    console.log(chalk.bold(`\n  총 ${aggregate.total}개의 취약점`))
  }

  // #244: 비-TTY(CI/agent)면 프롬프트에 hang → promptOrDefault 로 report-only(false) 폴백.
  //       대화형이면 기존대로 확인. --fix(autoFix) 는 비-TTY 에서도 강제 수정 경로.
  const shouldRunFix = autoFix
    ? true
    : aggregate.critical > 0 || aggregate.high > 0
      ? await promptOrDefault(
          async () =>
            (
              await prompt<{ shouldFix: boolean }>([
                {
                  type: 'confirm',
                  name: 'shouldFix',
                  message: '자동 수정을 시도할까요? (npm audit fix)',
                  default: true,
                },
              ])
            ).shouldFix,
          false,
        )
      : false

  if (shouldRunFix) {
    const npmProjects = perProject.filter((p) => p.pm === 'npm')
    if (npmProjects.length === 0) {
      const fixSpinner = ora('자동 수정 중...').start()
      fixSpinner.warn(`${perProject[0].pm}은 자동 fix를 지원하지 않습니다. npm 환경에서만 동작합니다.`)
    } else {
      for (const p of npmProjects) {
        const fixSpinner = ora(`${multi ? p.path + ' ' : ''}자동 수정 중...`).start()
        const result = runAuditFix('npm', p.path === '.' ? undefined : join('.', p.path))
        if (result.ok) fixSpinner.succeed(`${multi ? p.path + ' ' : ''}자동 수정 완료!`)
        else fixSpinner.warn(result.err ?? '일부 취약점은 수동 수정이 필요합니다.')
      }
    }
  }

  printNextStep({
    message: '보안 감사 완료.',
    command: 'vhk harness',
    cursorHint: '품질 점검해줘',
  })
}
