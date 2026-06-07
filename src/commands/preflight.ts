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

  // lint 활성 여부 = lint 스크립트 또는 eslint 설정 존재. + #173: scripts/PM/vitest 해석을 위해 pkg 전체 읽기.
  let scripts: Record<string, string> = {}
  let deps: Record<string, string> = {}
  try {
    const pkg = readJsonFile<{
      scripts?: Record<string, string>
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }>(join(cwd, 'package.json'))
    scripts = pkg.scripts ?? {}
    deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
  } catch {
    // package.json 없거나 파싱 실패 → lint/test 스킵(detectHasLinter false + testCmd null)
  }
  const hasEslintConfig = ESLINT_CONFIGS.some((f) => existsSync(join(cwd, f)))
  const hasLinter = detectHasLinter({ hasLintScript: !!scripts.lint, hasEslintConfig })

  // #173: PM 감지(lockfile) + vitest 설정/설치 여부 → 하드코딩 toolchain 대신 프로젝트 실제 도구 사용.
  const pm = existsSync(join(cwd, 'pnpm-lock.yaml'))
    ? 'pnpm'
    : existsSync(join(cwd, 'yarn.lock'))
      ? 'yarn'
      : 'npm'
  // vitest 전용 시그널만 — vite.config 는 제외(Vite 프로젝트인데 vitest 미설치면 npx vitest 폴백 실패 오탐).
  const VITEST_CONFIGS = ['vitest.config.ts', 'vitest.config.js', 'vitest.config.mjs', 'vitest.workspace.ts']
  const hasVitest = !!deps.vitest || VITEST_CONFIGS.some((f) => existsSync(join(cwd, f)))

  const mode: PreflightOptions['mode'] = opts.publish ? 'publish' : opts.pr ? 'pr' : 'default'
  const checks = runPreflight(
    { full: opts.full, mode },
    {
      run,
      nodeVersion: process.version,
      hasLinter,
      worktreeEnv: () => checkWorktreeEnvDir(cwd),
      pm,
      scripts,
      hasVitest,
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
