import chalk from 'chalk'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { ko } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { ensureNotHardStopped } from '../lib/hard-stop-guard.js'
import { safeExecFile } from '../lib/exec.js'
import { readJsonFile } from '../lib/read-json.js'
import { checkWorktreeEnvDir } from '../lib/worktree-env.js'
import {
  runPreflight,
  summarizePreflight,
  statusIcon,
  detectHasLinter,
  type Runner,
  type PreflightOptions,
} from '../lib/preflight.js'

// 린트 설정 파일 후보(eslint). 하나라도 있으면 lint 점검 활성.
const ESLINT_CONFIGS = [
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yml',
  'eslint.config.js',
  'eslint.config.mjs',
]

export interface PreflightCliOptions {
  publish?: boolean
  pr?: boolean
  full?: boolean
}

// vhk preflight — 출고 전 안전점검(Phase 1, 읽기 전용).
// 치명(critical) 실패 1개라도 있으면 exit 1 로 차단(--force 우회 없음).
export async function preflight(opts: PreflightCliOptions = {}): Promise<void> {
  if (!ensureNotHardStopped('preflight')) return // VHK-020
  console.log(chalk.bold(`\n${ko.preflight.title}\n`))

  const cwd = process.cwd()

  // 외부 명령은 safeExecFile 한 곳으로(execSync 금지). 코어는 주입된 run 만 호출.
  const run: Runner = (cmd, args) => {
    const r = safeExecFile(cmd, args)
    return r.ok ? { ok: true, out: r.out } : { ok: false, out: r.out, err: r.err }
  }

  // lint 활성 여부 = lint 스크립트 또는 eslint 설정 존재.
  let hasLintScript = false
  try {
    const pkg = readJsonFile<{ scripts?: Record<string, string> }>(join(cwd, 'package.json'))
    hasLintScript = !!pkg.scripts?.lint
  } catch {
    // package.json 없거나 파싱 실패 → lint 스킵(아래 detectHasLinter 가 false 처리)
  }
  const hasEslintConfig = ESLINT_CONFIGS.some((f) => existsSync(join(cwd, f)))
  const hasLinter = detectHasLinter({ hasLintScript, hasEslintConfig })

  const mode: PreflightOptions['mode'] = opts.publish ? 'publish' : opts.pr ? 'pr' : 'default'
  const checks = runPreflight(
    { full: opts.full, mode },
    {
      run,
      nodeVersion: process.version,
      hasLinter,
      worktreeEnv: () => checkWorktreeEnvDir(cwd),
    }
  )

  for (const c of checks) {
    console.log(`  ${statusIcon(c)} ${c.name.padEnd(14)} ${chalk.dim(c.detail)}`)
  }

  const s = summarizePreflight(checks)
  console.log('')
  if (s.blocked) {
    console.log(chalk.red.bold(`  ${ko.preflight.resultBlocked(s.failed)}`))
    printNextStep({
      message: ko.preflight.nextBlocked,
      command: 'vhk preflight',
      cursorHint: 'preflight 다시 돌려줘',
    })
    process.exitCode = 1
  } else {
    console.log(chalk.green.bold(`  ${ko.preflight.resultPass(s.warned)}`))
    printNextStep({
      message: ko.preflight.nextPass,
      command: opts.publish ? 'vhk publish' : 'vhk save',
      cursorHint: '다음 단계로',
    })
  }
}
