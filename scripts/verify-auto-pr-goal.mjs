import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'

if (process.platform !== 'win32') {
  process.stdout.write(JSON.stringify({ supported: false }))
  process.exit(0)
}

const createdUrl = 'https://example.invalid/pull/1'
const existingUrl = 'https://example.invalid/pull/7'

function makeTempRoot() {
  const candidates = process.env.PUBLIC
    ? [join(process.env.PUBLIC, 'Documents'), tmpdir()]
    : [tmpdir()]
  let lastError
  for (const candidate of candidates) {
    try {
      mkdirSync(candidate, { recursive: true })
      return mkdtempSync(join(candidate, 'vhk-auto-pr-'))
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

function spawnCollected(file, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] })
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
    child.on('close', (status) => resolve({ status, stdout, stderr }))
  })
}

function readCalls(log) {
  if (!existsSync(log)) return []
  const content = readFileSync(log, 'utf8').trim()
  if (!content) return []
  return content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
}

function called(calls, tool, ...prefix) {
  return calls.some(
    (call) => call.tool === tool && prefix.every((argument, index) => call.args[index] === argument),
  )
}

function assertBlocked(name, scenario) {
  const published = called(scenario.calls, 'git', 'push') || called(scenario.calls, 'gh', 'pr', 'create')
  if (scenario.result.status === 0 || published) {
    throw new Error(JSON.stringify({ name, result: scenario.result, calls: scenario.calls }))
  }
  return true
}

const root = makeTempRoot()
try {
  const bin = join(root, 'bin')
  const repo = join(root, 'repo')
  const nested = join(repo, 'nested')
  const body = join(root, 'body.md')
  mkdirSync(bin)
  mkdirSync(nested, { recursive: true })
  writeFileSync(body, 'Portable automation verification\n')

  const fakeGit = `
    import { appendFileSync } from 'node:fs'
    const args = process.argv.slice(2)
    appendFileSync(process.env.VHK_FAKE_LOG, JSON.stringify({ tool: 'git', args }) + '\\n')
    const key = args.join(' ')
    if (key === 'rev-parse --show-toplevel') process.stdout.write(process.env.VHK_FAKE_REPO + '\\n')
    else if (key === 'branch --show-current') process.stdout.write((process.env.VHK_FAKE_BRANCH ?? 'feat/portable-test') + '\\n')
    else if (key === 'status --porcelain') {
      if (process.env.VHK_FAKE_DIRTY === '1') process.stdout.write(' M tracked-file\\n')
    }
    else if (key.startsWith('rev-list --count HEAD..')) process.stdout.write('0\\n')
    else if (key.startsWith('rev-list --count origin/')) process.stdout.write('1\\n')
    else if (args[0] === 'fetch' || args[0] === 'push') {}
    else { process.stderr.write('unsupported git call: ' + key); process.exitCode = 9 }
  `
  const fakeGh = `
    import { appendFileSync } from 'node:fs'
    const args = process.argv.slice(2)
    appendFileSync(process.env.VHK_FAKE_LOG, JSON.stringify({ tool: 'gh', args }) + '\\n')
    if (args[0] === 'pr' && args[1] === 'list') {
      const url = process.env.VHK_FAKE_EXISTING_URL
      process.stdout.write(url ? JSON.stringify([{ url }]) + '\\n' : '[]\\n')
    }
    else if (args[0] === 'pr' && args[1] === 'create') process.stdout.write('${createdUrl}\\n')
    else { process.stderr.write('unsupported gh call: ' + args.join(' ')); process.exitCode = 9 }
  `
  writeFileSync(join(bin, 'fake-git.mjs'), fakeGit)
  writeFileSync(join(bin, 'fake-gh.mjs'), fakeGh)
  writeFileSync(join(bin, 'git.cmd'), `@echo off\r\n"${process.execPath}" "%~dp0fake-git.mjs" %*\r\nexit /b %ERRORLEVEL%\r\n`)
  writeFileSync(join(bin, 'gh.cmd'), `@echo off\r\n"${process.execPath}" "%~dp0fake-gh.mjs" %*\r\nexit /b %ERRORLEVEL%\r\n`)

  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') ?? 'Path'
  const baseEnv = {
    ...process.env,
    [pathKey]: `${bin}${delimiter}${process.env[pathKey] ?? ''}`,
    VHK_FAKE_REPO: repo,
  }
  const script = join(process.cwd(), 'scripts', 'auto_pr_goal.ps1')

  async function runScenario(name, envOverrides = {}, repositoryRoot = repo) {
    const log = join(root, `${name}.jsonl`)
    writeFileSync(log, '')
    const result = await spawnCollected('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script,
      '-RepositoryRoot', repositoryRoot,
      '-BaseBranch', 'main',
      '-Title', 'Portable automation test',
      '-BodyFile', body,
    ], {
      cwd: process.cwd(),
      env: { ...baseEnv, ...envOverrides, VHK_FAKE_LOG: log },
    })
    return { result, calls: readCalls(log) }
  }

  const success = await runScenario('success')
  if (success.result.status !== 0) throw new Error(success.result.stderr || success.result.stdout)
  const pushed = called(success.calls, 'git', 'push')
  const created = called(success.calls, 'gh', 'pr', 'create')
  const listCall = success.calls.find((call) => call.tool === 'gh' && call.args[0] === 'pr' && call.args[1] === 'list')
  const baseIndex = listCall?.args.indexOf('--base') ?? -1
  const baseScoped = baseIndex >= 0 && listCall.args[baseIndex + 1] === 'main'
  if (!pushed || !created || !baseScoped || success.result.stdout.trim() !== createdUrl) {
    throw new Error(JSON.stringify({ pushed, created, baseScoped, result: success.result, calls: success.calls }))
  }

  const hardStop = join(repo, '.vhk', 'HARD_STOP')
  mkdirSync(join(repo, '.vhk'))
  writeFileSync(hardStop, 'stop\n')
  const hardStopBlocked = assertBlocked('hard-stop', await runScenario('hard-stop'))
  await rm(hardStop, { force: true })

  const nestedRootBlocked = assertBlocked('nested-root', await runScenario('nested-root', {}, nested))
  const mainBlocked = assertBlocked('main', await runScenario('main', { VHK_FAKE_BRANCH: 'main' }))
  const dirtyBlocked = assertBlocked('dirty', await runScenario('dirty', { VHK_FAKE_DIRTY: '1' }))

  const existing = await runScenario('existing', { VHK_FAKE_EXISTING_URL: existingUrl })
  const existingReused = existing.result.status === 0
    && existing.result.stdout.trim() === existingUrl
    && !called(existing.calls, 'gh', 'pr', 'create')
  if (!existingReused) {
    throw new Error(JSON.stringify({ name: 'existing', result: existing.result, calls: existing.calls }))
  }

  process.stdout.write(JSON.stringify({
    supported: true,
    created,
    pushed,
    hardStopBlocked,
    nestedRootBlocked,
    mainBlocked,
    dirtyBlocked,
    existingReused,
    baseScoped,
  }))
} finally {
  await rm(root, { recursive: true, force: true })
}
