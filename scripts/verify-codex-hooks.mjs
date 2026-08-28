import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { localToday } from './check-records.mjs'

function readHook(event) {
  const config = JSON.parse(readFileSync('.codex/hooks.json', 'utf8'))
  const hook = config.hooks?.[event]?.[0]?.hooks?.[0]
  if (!hook) throw new Error(`${event} hook 없음`)
  return hook
}

function spawnCollected(file, args, cwd, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.stdin.on('error', (error) => {
      // A hook may intentionally exit before consuming stdin. Linux reports the
      // closed pipe as EPIPE and Windows as EOF; the child close status remains authoritative.
      if (error.code !== 'EPIPE' && error.code !== 'EOF') reject(error)
    })
    child.on('close', (status) => resolve({ status, stdout, stderr }))
    child.stdin.end(input)
  })
}

function runHook(hook, cwd, input = '') {
  if (process.platform !== 'win32') {
    return spawnCollected('sh', ['-c', hook.command], cwd, input)
  }

  const command = hook.commandWindows
  const prefix = 'powershell.exe -NoProfile -Command "'
  if (!command?.startsWith(prefix) || !command.endsWith('"')) {
    throw new Error('지원하지 않는 Windows hook command 형식')
  }
  return spawnCollected(
    'powershell.exe',
    ['-NoProfile', '-Command', command.slice(prefix.length, -1)],
    cwd,
    input,
  )
}

function makeTempRepo() {
  const candidates = process.platform === 'win32' && process.env.PUBLIC
    ? [join(process.env.PUBLIC, 'Documents'), tmpdir()]
    : [tmpdir()]
  let lastError
  for (const candidate of candidates) {
    try {
      mkdirSync(candidate, { recursive: true })
      return mkdtempSync(join(candidate, 'vhk-codex-hook-'))
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

function initGitRepo(repo) {
  mkdirSync(repo, { recursive: true })
  const init = spawnSync('git', ['init', '-q'], { cwd: repo, encoding: 'utf8' })
  if (init.status !== 0) throw new Error(init.stderr)
}

function isQuietSuccess(result) {
  return result.status === 0 && result.stdout === '' && result.stderr === ''
}

const fixtureRoot = makeTempRepo()
try {
  const preToolUseHook = readHook('PreToolUse')
  const stopHook = readHook('Stop')

  const nonGitDir = join(fixtureRoot, 'non-git')
  mkdirSync(nonGitDir, { recursive: true })
  // PR #610: pipe backpressure makes an early hook exit reproduce Node 24/Linux's
  // asynchronous child.stdin EPIPE instead of depending on scheduler timing.
  const earlyExitPayload = JSON.stringify({ padding: 'x'.repeat(1024 * 1024) })
  const nonGitPreToolUse = await runHook(preToolUseHook, nonGitDir, earlyExitPayload)
  const nonGitStop = await runHook(stopHook, nonGitDir, '{}')
  const nonGitPreToolUseQuiet = isQuietSuccess(nonGitPreToolUse)
  const nonGitStopQuiet = isQuietSuccess(nonGitStop)

  const noRunnerRepo = join(fixtureRoot, 'no-runner-repo')
  initGitRepo(noRunnerRepo)
  const noRunnerPreToolUse = await runHook(preToolUseHook, noRunnerRepo, '{}')
  const noRunnerStop = await runHook(stopHook, noRunnerRepo, '{}')
  const missingRunnerPreToolUseQuiet = isQuietSuccess(noRunnerPreToolUse)
  const missingRunnerStopQuiet = isQuietSuccess(noRunnerStop)

  const repo = join(fixtureRoot, 'vhk-repo')
  initGitRepo(repo)
  mkdirSync(join(repo, 'scripts'), { recursive: true })
  mkdirSync(join(repo, 'src'), { recursive: true })
  mkdirSync(join(repo, '.vhk'), { recursive: true })
  for (const file of ['_lib.mjs', 'check-records.mjs', 'record-reminder.mjs']) {
    copyFileSync(join(process.cwd(), 'scripts', file), join(repo, 'scripts', file))
  }

  writeFileSync(join(repo, '.vhk', 'HARD_STOP'), 'test')
  const payload = JSON.stringify({ tool_input: { command: 'git commit -m test' } })
  const blocked = await runHook(preToolUseHook, join(repo, 'src'), payload)
  const hardStopBlocked = blocked.status === 2 && blocked.stderr.includes('HARD_STOP')

  unlinkSync(join(repo, '.vhk', 'HARD_STOP'))
  const rootRun = await runHook(
    preToolUseHook,
    repo,
    JSON.stringify({ tool_input: { command: 'git status --short' } }),
  )
  const vhkRootRuns = rootRun.status === 0

  writeFileSync(join(repo, 'src', 'probe.ts'), 'export const probe = true\n')
  const reminded = await runHook(stopHook, join(repo, 'src'))
  const reminderShown = reminded.status === 0 && reminded.stdout.includes('systemMessage')

  const devlogDir = join(repo, 'docs', 'devlog')
  mkdirSync(devlogDir, { recursive: true })
  writeFileSync(join(devlogDir, `${localToday()}-hook-check.md`), '# hook check\n')
  const quiet = await runHook(stopHook, join(repo, 'src'))
  const devlogSuppressed = quiet.status === 0 && quiet.stdout.trim() === ''

  const childRepo = join(fixtureRoot, 'child-exit-repo')
  initGitRepo(childRepo)
  mkdirSync(join(childRepo, 'scripts'), { recursive: true })
  writeFileSync(
    join(childRepo, 'scripts', 'check-records.mjs'),
    "process.stdin.setEncoding('utf8'); let input = ''; process.stdin.on('data', chunk => { input += chunk }); process.stdin.on('end', () => { process.stdout.write(input); process.exitCode = 7 })\n",
  )
  writeFileSync(
    join(childRepo, 'scripts', 'record-reminder.mjs'),
    "process.stdin.setEncoding('utf8'); let input = ''; process.stdin.on('data', chunk => { input += chunk }); process.stdin.on('end', () => { process.stdout.write(input); process.exitCode = 9 })\n",
  )
  const preToolUseInput = 'pretool-stdin-probe'
  const stopInput = 'stop-stdin-probe'
  const preToolUseChild = await runHook(preToolUseHook, childRepo, preToolUseInput)
  const stopChild = await runHook(stopHook, childRepo, stopInput)
  const preToolUseExitPropagated = preToolUseChild.status === 7
  const stopExitPropagated = stopChild.status === 9
  const preToolUseStdinPreserved = preToolUseChild.stdout === preToolUseInput
  const stopStdinPreserved = stopChild.stdout === stopInput

  const report = {
    nonGitPreToolUseQuiet,
    nonGitStopQuiet,
    missingRunnerPreToolUseQuiet,
    missingRunnerStopQuiet,
    vhkRootRuns,
    hardStopBlocked,
    reminderShown,
    devlogSuppressed,
    preToolUseExitPropagated,
    stopExitPropagated,
    preToolUseStdinPreserved,
    stopStdinPreserved,
  }
  if (Object.values(report).some((passed) => !passed)) {
    throw new Error(
      JSON.stringify({
        report,
        nonGitPreToolUse,
        nonGitStop,
        noRunnerPreToolUse,
        noRunnerStop,
        blocked,
        rootRun,
        reminded,
        quiet,
        preToolUseChild,
        stopChild,
      }),
    )
  }
  process.stdout.write(JSON.stringify(report))
} finally {
  await rm(fixtureRoot, { recursive: true, force: true })
}
