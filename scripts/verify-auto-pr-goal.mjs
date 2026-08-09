import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { delimiter, join } from 'node:path'
import { tmpdir } from 'node:os'

if (process.platform !== 'win32') {
  process.stdout.write(JSON.stringify({ supported: false }))
  process.exit(0)
}

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

const root = makeTempRoot()
try {
  const bin = join(root, 'bin')
  const repo = join(root, 'repo')
  const log = join(root, 'calls.jsonl')
  const body = join(root, 'body.md')
  mkdirSync(bin)
  mkdirSync(repo)
  writeFileSync(body, 'Portable automation verification\n')

  const fakeGit = `
    import { appendFileSync } from 'node:fs'
    const args = process.argv.slice(2)
    appendFileSync(process.env.VHK_FAKE_LOG, JSON.stringify({ tool: 'git', args }) + '\\n')
    const key = args.join(' ')
    if (key === 'rev-parse --show-toplevel') process.stdout.write(process.env.VHK_FAKE_REPO + '\\n')
    else if (key === 'branch --show-current') process.stdout.write('feat/portable-test\\n')
    else if (key.startsWith('rev-list --count HEAD..')) process.stdout.write('0\\n')
    else if (key.startsWith('rev-list --count origin/')) process.stdout.write('1\\n')
    else if (key === 'status --porcelain' || args[0] === 'fetch' || args[0] === 'push') {}
    else { process.stderr.write('unsupported git call: ' + key); process.exitCode = 9 }
  `
  const fakeGh = `
    import { appendFileSync } from 'node:fs'
    const args = process.argv.slice(2)
    appendFileSync(process.env.VHK_FAKE_LOG, JSON.stringify({ tool: 'gh', args }) + '\\n')
    if (args[0] === 'pr' && args[1] === 'list') process.stdout.write('[]\\n')
    else if (args[0] === 'pr' && args[1] === 'create') process.stdout.write('https://example.invalid/pull/1\\n')
    else { process.stderr.write('unsupported gh call: ' + args.join(' ')); process.exitCode = 9 }
  `
  writeFileSync(join(bin, 'fake-git.mjs'), fakeGit)
  writeFileSync(join(bin, 'fake-gh.mjs'), fakeGh)
  writeFileSync(join(bin, 'git.cmd'), `@echo off\r\n"${process.execPath}" "%~dp0fake-git.mjs" %*\r\nexit /b %ERRORLEVEL%\r\n`)
  writeFileSync(join(bin, 'gh.cmd'), `@echo off\r\n"${process.execPath}" "%~dp0fake-gh.mjs" %*\r\nexit /b %ERRORLEVEL%\r\n`)

  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') ?? 'Path'
  const env = {
    ...process.env,
    [pathKey]: `${bin}${delimiter}${process.env[pathKey] ?? ''}`,
    VHK_FAKE_LOG: log,
    VHK_FAKE_REPO: repo,
  }
  const script = join(process.cwd(), 'scripts', 'auto_pr_goal.ps1')
  const result = await spawnCollected('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script,
    '-RepositoryRoot', repo,
    '-BaseBranch', 'main',
    '-Title', 'Portable automation test',
    '-BodyFile', body,
  ], { cwd: process.cwd(), env })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout)

  const calls = readFileSync(log, 'utf8')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  const pushed = calls.some((call) => call.tool === 'git' && call.args[0] === 'push')
  const created = calls.some(
    (call) => call.tool === 'gh' && call.args[0] === 'pr' && call.args[1] === 'create',
  )
  if (!pushed || !created || !result.stdout.includes('https://example.invalid/pull/1')) {
    throw new Error(JSON.stringify({ pushed, created, stdout: result.stdout, calls }))
  }
  process.stdout.write(JSON.stringify({ supported: true, created, pushed }))
} finally {
  await rm(root, { recursive: true, force: true })
}
