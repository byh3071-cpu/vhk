import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import inquirer from 'inquirer'
import { appendEvolveLog, currentEvolveDecisions, readEvolveLog } from '../src/lib/evolve-log.js'

vi.mock('inquirer')

describe('evolve undo — sync 실패 처리', () => {
  const originalCwd = process.cwd()
  const originalInteractive = process.env.VHK_FORCE_INTERACTIVE
  let originalExitCode: typeof process.exitCode
  let tempDir: string | undefined

  beforeEach(() => {
    originalExitCode = process.exitCode
    process.exitCode = undefined
  })

  afterEach(() => {
    process.chdir(originalCwd)
    if (originalInteractive === undefined) delete process.env.VHK_FORCE_INTERACTIVE
    else process.env.VHK_FORCE_INTERACTIVE = originalInteractive
    process.exitCode = originalExitCode
    vi.restoreAllMocks()
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true })
    tempDir = undefined
  })

  it('RULES.md 복원 뒤 sync가 실패하면 undo 기록·패턴 재활성화·성공 출력을 하지 않는다', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-evolve-undo-'))
    tempDir = dir
    const backup = path.join(dir, 'RULES.md.bak')
    fs.writeFileSync(path.join(dir, 'RULES.md'), '# current\n', 'utf-8')
    fs.writeFileSync(backup, '# restored\n\n## 코딩 규칙\n- safe\n', 'utf-8')
    fs.mkdirSync(path.join(dir, '.cursorrules'))
    fs.mkdirSync(path.join(dir, '.vhk'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.vhk', 'memory.json'), JSON.stringify({
      schemaVersion: 2,
      decisions: [],
      failures: [],
      successes: [],
      patterns: [{
        id: 'p1', kind: 'avoid', axis: 'tag', signal: 'sync', count: 3,
        sources: [], summary: 'sync failure', createdAt: '2026-08-01T00:00:00.000Z',
        status: 'archived', tags: [], _sig: 'avoid:tag:sync',
      }],
    }), 'utf-8')
    appendEvolveLog(dir, {
      ts: '2026-08-02T00:00:00.000Z',
      suggId: 'p1:rule',
      patternId: 'p1',
      targetLayer: 'rule',
      applied: true,
      rejectReason: null,
      draft: '- safe',
      rulesBackupPath: backup,
    })

    process.chdir(dir)
    process.env.VHK_FORCE_INTERACTIVE = '1'
    vi.mocked(inquirer.prompt).mockResolvedValue({ confirmed: true })
    const output: string[] = []
    vi.spyOn(console, 'log').mockImplementation((message?: unknown) => { output.push(String(message)) })

    const { evolveUndo } = await import('../src/commands/evolve.js')
    await evolveUndo()

    expect(process.exitCode).toBe(1)
    expect(currentEvolveDecisions(readEvolveLog(dir))).toHaveLength(1)
    const memory = JSON.parse(fs.readFileSync(path.join(dir, '.vhk', 'memory.json'), 'utf-8')) as {
      patterns: Array<{ status: string }>
    }
    expect(memory.patterns[0].status).toBe('archived')
    expect(output.join('\n')).not.toContain('되돌리기 완료')
  })
})
