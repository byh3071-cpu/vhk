import chalk from 'chalk'
import { existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { ko } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { ensureNotHardStopped } from '../lib/hard-stop-guard.js'
import { safeExecFile } from '../lib/exec.js'
import type { Runner } from '../lib/preflight.js'
import { runWorktreeCheck } from '../worktree/check.js'
import { collectCopyItems } from '../worktree/configList.js'
import { copyAll, realCopyDeps } from '../worktree/copy.js'
import { addWorktree, sanitizeBranchToDir } from '../worktree/add.js'
import type { CopyResult, WorktreeOptions } from '../worktree/types.js'

// safeExecFile → Runner 어댑터(외부 명령 단일 경로 — execSync 금지).
function realRunner(): Runner {
  return (cmd, args) => {
    const r = safeExecFile(cmd, args)
    return r.ok ? { ok: true, out: r.out } : { ok: false, out: r.out, err: r.err }
  }
}

// CopyResult 한 줄 출력 — 비밀값 절대 미노출(env 는 키 개수만).
function printCopy(r: CopyResult): void {
  const name = basename(r.item.target)
  if (r.status === 'copied') {
    const detail = r.item.kind === 'env' ? `(${r.keyCount} keys)` : ''
    console.log(chalk.green(`  🟢 copied ${name}`) + chalk.dim(` ${detail}`))
  } else if (r.status === 'missing-source') {
    console.log(chalk.dim(`  ⚪ skip ${name} — 원본 없음`))
  } else if (r.status === 'error') {
    console.log(chalk.yellow(`  🟡 ${name} — ${r.detail}`))
  }
}

// vhk worktree check — 현재 worktree 의 필수 env 누락 점검(개수만).
export async function worktreeCheck(): Promise<void> {
  console.log(chalk.bold(`\n${ko.worktree.checkTitle}\n`))
  const r = runWorktreeCheck(process.cwd())
  const icon = r.status === 'pass' ? '🟢' : r.status === 'skip' ? '⚪' : '🔴'
  console.log(`  ${icon} ${r.detail}`)
  if (r.status === 'fail') {
    process.exitCode = 1
    printNextStep({
      message: '누락된 env 키를 채운 뒤 다시 점검하세요.',
      command: 'vhk worktree check',
      cursorHint: 'worktree env 다시 점검해줘',
    })
  }
}

// vhk worktree add <branch> — worktree 생성 + 필수 env/설정 자동 복사(+ --install).
export async function worktreeAdd(branch: string | undefined, opts: WorktreeOptions = {}): Promise<void> {
  if (!ensureNotHardStopped('worktree add')) return // VHK-020
  if (!branch) {
    console.log(chalk.yellow(`  ${ko.worktree.needBranch}`))
    process.exitCode = 1
    return
  }
  console.log(chalk.bold(`\n${ko.worktree.addTitle(branch)}\n`))

  const cwd = process.cwd()
  const copyDeps = realCopyDeps()
  const result = addWorktree(
    branch,
    { install: opts.install },
    {
      sourceDir: cwd,
      run: realRunner(),
      exists: (p) => existsSync(p),
      // 형제 디렉터리: ../<repoName>-<branch>
      resolveTargetPath: (b) => join(dirname(cwd), sanitizeBranchToDir(basename(cwd), b)),
      collectItems: (s, t) => collectCopyItems(s, t),
      copyAll: (items) => copyAll(items, copyDeps),
    }
  )

  if (result.status === 'aborted-exists') {
    console.log(chalk.yellow(`  ${ko.worktree.abortedExists(result.targetPath)}`))
    process.exitCode = 1
    return
  }
  if (result.status === 'git-failed') {
    console.log(chalk.red(`  ${ko.worktree.gitFailed(result.detail)}`))
    process.exitCode = 1
    return
  }

  console.log(chalk.green(`  🟢 worktree created at ${result.targetPath}`))
  for (const c of result.copies) printCopy(c)
  if (opts.install) {
    console.log(result.installed ? chalk.green('  🟢 pnpm install') : chalk.yellow('  🟡 pnpm install 실패 — 수동 실행 필요'))
  } else {
    console.log(chalk.dim(`  ⚪ ${ko.worktree.installSkipped}`))
  }
  console.log(chalk.green.bold(`\n  ${ko.worktree.ready}`))
  printNextStep({
    message: `worktree 준비 완료 — 작업하려면 이동:`,
    command: `cd ${result.targetPath}`,
    cursorHint: '새 worktree에서 작업 시작',
  })
}
