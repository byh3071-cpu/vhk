import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { execFile, type ExecFileException } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const repoRoot = process.cwd()
const tsxCli = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const entrypoint = path.join(repoRoot, 'src', 'index.ts')

describe('context --json', () => {
  let cwd: string
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-context-json-'))
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(async () => {
    logSpy.mockRestore()
    await fs.promises.rm(cwd, { recursive: true, force: true })
  })

  it('strictly validates non-meta markdown files through injected readers', async () => {
    const seen: string[] = []
    const { validateGoalMarkdownFiles } = await import('../src/commands/context.js')

    const result = validateGoalMarkdownFiles(
      cwd,
      ['_meta.md', 'valid.md', 'broken.md', 'notes.txt'],
      (filePath: string) => {
        seen.push(filePath)
        return filePath.endsWith('broken.md') ? null : {}
      },
      () => ({ isFile: () => true }),
    )

    expect(result).toBe(false)
    expect(seen).toEqual([path.join(cwd, 'valid.md'), path.join(cwd, 'broken.md')])
  })

  it('treats an injected stat failure as an unreadable Goal file', async () => {
    const { validateGoalMarkdownFiles } = await import('../src/commands/context.js')

    const result = validateGoalMarkdownFiles(
      cwd,
      ['unreadable.md'],
      () => ({}),
      () => {
        throw new Error('stat failed')
      },
    )

    expect(result).toBe(false)
  })

  it('projects the selected goal as one JSON document without writing state', async () => {
    createGoal(cwd, 134, 'Example Goal', 'IN_PROGRESS', [
      '### Phase 1',
      '- [ ] **Task 1** Implement JSON / evidence: sample-evidence',
      '',
      '### Phase 2',
      '- [ ] **Task 2** Verify JSON',
    ])
    createStateFiles(cwd)

    const before = snapshotState(cwd)
    const { contextJson } = await import('../src/commands/context.js')
    const result = await contextJson({ rootDir: cwd })

    expect(result.valid).toBe(true)
    expect(logSpy).toHaveBeenCalledTimes(1)
    const output = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as typeof result
    expect(output).toEqual(result)
    expect(output.schemaVersion).toBe(1)
    expect(output.activeGoal?.id).toBe('goal:134')
    expect(output.activeGoal?.tasks).toEqual([
      {
        id: 'goal:134/task:1',
        phaseId: 'goal:134/phase:1',
        sourceStatus: 'pending',
        readiness: 'ready',
        dependsOn: [],
        evidenceHint: 'sample-evidence',
        sourceRef: '134-example.md',
        sourceLine: 9,
      },
      {
        id: 'goal:134/task:2',
        phaseId: 'goal:134/phase:2',
        sourceStatus: 'pending',
        readiness: 'waiting',
        dependsOn: ['goal:134/task:1'],
        evidenceHint: null,
        sourceRef: '134-example.md',
        sourceLine: 12,
      },
    ])
    expect(output.warnings).toEqual([])
    expect(output.errors).toEqual([])
    expect(snapshotState(cwd)).toEqual(before)
    expect(fs.readFileSync(path.join(cwd, 'goals', '134-example.md'), 'utf-8')).toContain(
      'Implement JSON',
    )

    const cli = await runCli(['context', '--json'], cwd)
    expect(cli.status).toBe(0)
    expect(cli.stderr).toBe('')
    expect(cli.stdout).toBe(`${JSON.stringify(output)}\n`)
    expect(JSON.parse(cli.stdout)).toEqual(output)
  })

  it('returns a valid no-active result with a warning and no error', async () => {
    const { contextJson } = await import('../src/commands/context.js')

    const result = await contextJson({ rootDir: cwd })

    expect(result).toEqual({
      schemaVersion: 1,
      valid: true,
      activeGoal: null,
      warnings: [{ code: 'NO_ACTIVE_GOAL' }],
      errors: [],
    })
    expect(JSON.parse(String(logSpy.mock.calls[0]?.[0]))).toEqual(result)

    const cli = await runCli(['context', '--json'], cwd)
    expect(cli.status).toBe(0)
    expect(cli.stderr).toBe('')
    expect(cli.stdout).toBe(`${JSON.stringify(result)}\n`)
    expect(JSON.parse(cli.stdout)).toEqual(result)
  })

  it('keeps a legacy goal without phases valid and reports NO_PHASES', async () => {
    createGoal(cwd, 7, 'Legacy Goal', 'IN_PROGRESS', ['Legacy body only'])
    const { contextJson } = await import('../src/commands/context.js')

    const result = await contextJson({ rootDir: cwd })

    expect(result.valid).toBe(true)
    expect(result.activeGoal).toEqual({
      id: 'goal:7',
      title: 'Legacy Goal',
      sourceStatus: 'IN_PROGRESS',
      phases: [],
      tasks: [],
    })
    expect(result.warnings).toEqual([{ code: 'NO_PHASES' }])
    expect(result.errors).toEqual([])

    const cli = await runCli(['context', '--json'], cwd)
    expect(cli.status).toBe(0)
    expect(cli.stderr).toBe('')
    expect(JSON.parse(cli.stdout).warnings).toEqual([{ code: 'NO_PHASES' }])
  })

  it('rejects compact plus json before touching the project root', async () => {
    const { contextJson } = await import('../src/commands/context.js')

    const result = await contextJson({ compact: true, rootDir: path.join(cwd, 'missing') })

    expect(result).toEqual({
      schemaVersion: 1,
      valid: false,
      activeGoal: null,
      warnings: [],
      errors: [{ code: 'INCOMPATIBLE_FLAGS' }],
    })
    expect(logSpy).toHaveBeenCalledTimes(1)
  })

  it('returns a safe invalid JSON result for malformed Goal structure', async () => {
    createGoal(cwd, 8, 'Broken Goal', 'IN_PROGRESS', ['### Phase 1'])
    createStateFiles(cwd)
    const before = snapshotState(cwd)
    const { contextJson } = await import('../src/commands/context.js')

    const result = await contextJson({ rootDir: cwd })

    expect(result.valid).toBe(false)
    expect(result.activeGoal).toBeNull()
    expect(result.errors).toEqual([{ code: 'EMPTY_PHASE', sourceLine: 8 }])
    expect(snapshotState(cwd)).toEqual(before)
  })

  it('returns exit 1 with only safe diagnostics for malformed Goal structure', async () => {
    createGoal(cwd, 18, 'Broken CLI Goal', 'IN_PROGRESS', ['### Phase 1'])

    const result = await runCli(['context', '--json'], cwd)

    expect(result.status).toBe(1)
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe(
      '{"schemaVersion":1,"valid":false,"activeGoal":null,"warnings":[],"errors":[{"code":"EMPTY_PHASE","sourceLine":8}]}\n',
    )
    expect(JSON.parse(result.stdout)).toEqual({
      schemaVersion: 1,
      valid: false,
      activeGoal: null,
      warnings: [],
      errors: [{ code: 'EMPTY_PHASE', sourceLine: 8 }],
    })
  })

  it('returns GOAL_READ_FAILED when goals is a file', async () => {
    fs.writeFileSync(path.join(cwd, 'goals'), 'not a directory')
    const { contextJson } = await import('../src/commands/context.js')

    const result = await contextJson({ rootDir: cwd })

    expect(result).toEqual({
      schemaVersion: 1,
      valid: false,
      activeGoal: null,
      warnings: [],
      errors: [{ code: 'GOAL_READ_FAILED' }],
    })
  })

  it('returns GOAL_READ_FAILED for an invalid Goal candidate', async () => {
    fs.mkdirSync(path.join(cwd, 'goals'))
    fs.writeFileSync(
      path.join(cwd, 'goals', 'invalid.md'),
      ['---', 'type: goal', 'id: not-a-number', 'title: Invalid', 'status: IN_PROGRESS', '---', ''].join('\n'),
    )
    const { contextJson } = await import('../src/commands/context.js')

    const result = await contextJson({ rootDir: cwd })

    expect(result.errors).toEqual([{ code: 'GOAL_READ_FAILED' }])
    expect(result.activeGoal).toBeNull()
    expect(result.valid).toBe(false)
  })

  it('returns GOAL_READ_FAILED for duplicate Goal ids', async () => {
    createGoal(cwd, 21, 'First Goal', 'DONE', ['Completed'])
    writeGoalFile(cwd, '22-second.md', 21, 'Second Goal', 'DONE', ['Completed'])
    const { contextJson } = await import('../src/commands/context.js')

    const result = await contextJson({ rootDir: cwd })

    expect(result.errors).toEqual([{ code: 'GOAL_READ_FAILED' }])
    expect(result.activeGoal).toBeNull()
    expect(result.valid).toBe(false)
  })

  it('returns GOAL_READ_FAILED for invalid Goal dependencies', async () => {
    createGoal(cwd, 23, 'Blocked Goal', 'IN_PROGRESS', ['### Phase 1', '- [ ] **Task 1** Work'], '999')
    const { contextJson } = await import('../src/commands/context.js')

    const result = await contextJson({ rootDir: cwd })

    expect(result.errors).toEqual([{ code: 'GOAL_READ_FAILED' }])
    expect(result.activeGoal).toBeNull()
    expect(result.valid).toBe(false)
  })

  it('blocks sensitive Goal text without returning the original value', async () => {
    const secretLikeTitle = 'private-user@gmail.com'
    createGoal(cwd, 9, 'Safe Goal', 'IN_PROGRESS', [
      '### Phase 1',
      `- [ ] **Task 1** ${secretLikeTitle}`,
    ])
    createStateFiles(cwd)
    const before = snapshotState(cwd)
    const { contextJson } = await import('../src/commands/context.js')

    const result = await contextJson({ rootDir: cwd })

    expect(result.valid).toBe(false)
    expect(result.activeGoal).toBeNull()
    expect(result.errors).toEqual([{ code: 'PUBLIC_BOUNDARY_VIOLATION' }])
    expect(JSON.stringify(result)).not.toContain(secretLikeTitle)
    expect(snapshotState(cwd)).toEqual(before)
  })

  it('returns exit 1 without leaking sensitive Goal text through the CLI', async () => {
    const secretLikeTitle = 'private-user@gmail.com'
    createGoal(cwd, 19, 'Safe CLI Goal', 'IN_PROGRESS', [
      '### Phase 1',
      `- [ ] **Task 1** ${secretLikeTitle}`,
    ])

    const result = await runCli(['context', '--json'], cwd)

    expect(result.status).toBe(1)
    expect(result.stderr).toBe('')
    expect(result.stdout).not.toContain(secretLikeTitle)
    expect(JSON.parse(result.stdout)).toEqual({
      schemaVersion: 1,
      valid: false,
      activeGoal: null,
      warnings: [],
      errors: [{ code: 'PUBLIC_BOUNDARY_VIOLATION' }],
    })
  })

  it.each([
    {
      name: '개인 저장소명 title',
      value: ['yohan', '-', 'brain'].join(''),
      title: ['yohan', '-', 'brain'].join(''),
      body: ['### Phase 1', '- [ ] **Task 1** Safe task'],
    },
    {
      name: '외부 객체 ID evidence',
      value: ['wf_', 'abcdef'].join(''),
      title: 'Safe Goal',
      body: [
        '### Phase 1',
        `- [ ] **Task 1** Safe task / evidence: ${['wf_', 'abcdef'].join('')}`,
      ],
    },
  ])('$name을 CLI stdout에 남기지 않고 exit 1로 차단한다', async ({ value, title, body }) => {
    createGoal(cwd, 20, title, 'IN_PROGRESS', body)

    const result = await runCli(['context', '--json'], cwd)

    expect(result.status).toBe(1)
    expect(result.stderr).toBe('')
    expect(result.stdout).not.toContain(value)
    expect(JSON.parse(result.stdout)).toEqual({
      schemaVersion: 1,
      valid: false,
      activeGoal: null,
      warnings: [],
      errors: [{ code: 'PUBLIC_BOUNDARY_VIOLATION' }],
    })
  })

  it('registers --json on the existing context command without changing human execution', async () => {
    const { program } = await import('../src/index.js')
    const contextCommand = program.commands.find((command) => command.name() === 'context')

    expect(contextCommand?.options.some((option) => option.long === '--json')).toBe(true)
    expect(contextCommand?.options.some((option) => option.long === '--compact')).toBe(true)
  })

  it('uses exit 1 and pure JSON stdout for the compact/json Commander boundary', async () => {
    const result = await runCli(['context', '--compact', '--json'], repoRoot)

    expect(result.status).toBe(1)
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe(
      '{"schemaVersion":1,"valid":false,"activeGoal":null,"warnings":[],"errors":[{"code":"INCOMPATIBLE_FLAGS"}]}\n',
    )
    expect(JSON.parse(result.stdout)).toEqual({
      schemaVersion: 1,
      valid: false,
      activeGoal: null,
      warnings: [],
      errors: [{ code: 'INCOMPATIBLE_FLAGS' }],
    })
  })
})

async function runCli(
  args: string[],
  cwd: string,
): Promise<{ status: number; stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [tsxCli, entrypoint, ...args],
      { cwd, env: { ...process.env, CI: '1' }, encoding: 'utf-8' },
      (error: ExecFileException | null, stdout: string, stderr: string) => {
        if (error && typeof error.code !== 'number') {
          reject(error)
          return
        }
        resolve({ status: error?.code ?? 0, stdout, stderr })
      },
    )
  })
}

function createStateFiles(root: string): void {
  fs.mkdirSync(path.join(root, '.vhk'))
  fs.mkdirSync(path.join(root, 'docs', 'state'), { recursive: true })
  fs.writeFileSync(path.join(root, '.vhk', 'keep.txt'), 'keep')
  fs.writeFileSync(path.join(root, 'docs', 'state', 'keep.txt'), 'keep')
}

function createGoal(
  root: string,
  id: number,
  title: string,
  status: string,
  body: string[],
  dependsOn?: string,
): void {
  writeGoalFile(root, `${id}-example.md`, id, title, status, body, dependsOn)
}

function writeGoalFile(
  root: string,
  filename: string,
  id: number,
  title: string,
  status: string,
  body: string[],
  dependsOn?: string,
): void {
  fs.mkdirSync(path.join(root, 'goals'), { recursive: true })
  fs.writeFileSync(
    path.join(root, 'goals', filename),
    [
      '---',
      'type: goal',
      `id: ${id}`,
      `title: ${title}`,
      `status: ${status}`,
      ...(dependsOn === undefined ? [] : [`depends_on: ${dependsOn}`]),
      '---',
      '',
      ...body,
      '',
    ].join('\n'),
  )
}

function snapshotState(root: string): Record<string, { hash: string; mtimeMs: number }> {
  const result: Record<string, { hash: string; mtimeMs: number }> = {}
  for (const relative of ['goals', '.vhk', path.join('docs', 'state')]) {
    const absolute = path.join(root, relative)
    if (!fs.existsSync(absolute)) continue
    collectFiles(root, absolute, result)
  }
  return result
}

function collectFiles(
  root: string,
  directory: string,
  result: Record<string, { hash: string; mtimeMs: number }>,
): void {
  const directoryStat = fs.statSync(directory)
  result[path.relative(root, directory) || '.'] = {
    hash: createHash('sha256').update('<directory>').digest('hex'),
    mtimeMs: directoryStat.mtimeMs,
  }
  for (const entry of fs.readdirSync(directory)) {
    const absolute = path.join(directory, entry)
    const stat = fs.statSync(absolute)
    if (stat.isDirectory()) {
      collectFiles(root, absolute, result)
      continue
    }
    result[path.relative(root, absolute)] = {
      hash: createHash('sha256').update(fs.readFileSync(absolute)).digest('hex'),
      mtimeMs: stat.mtimeMs,
    }
  }
}
