import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import inquirer from 'inquirer'
import {
  LEGACY_QUEUE_ARCHIVE_PATH_REL,
  QUEUE_PATH_REL,
  evolveList,
  migrateLegacyQueueForMutation,
  type EvolveQueueFile,
} from '../src/commands/evolve.js'
import {
  appendEvolveLog,
  currentEvolveDecisions,
  readEvolveLog,
} from '../src/lib/evolve-log.js'

vi.mock('inquirer')

const NOW = '2026-08-05T00:00:00.000Z'

function makeProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-evolve-legacy-'))
  fs.mkdirSync(path.join(dir, '.vhk', 'evolve'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'RULES.md'), '## 코딩 규칙\n- 기존 규칙\n', 'utf-8')
  fs.writeFileSync(path.join(dir, '.vhk', 'memory.json'), JSON.stringify({
    schemaVersion: 2,
    decisions: [],
    failures: [],
    successes: [],
    patterns: [
      {
        id: 'p1', kind: 'avoid', axis: 'tag', signal: 'legacy', count: 3,
        sources: [], summary: '반복 실패', createdAt: '2026-08-04T00:00:00.000Z',
        status: 'active', tags: [], _sig: 'avoid:tag:legacy',
      },
      {
        id: 'p2', kind: 'avoid', axis: 'tag', signal: 'applied', count: 3,
        sources: [], summary: '반복 실패', createdAt: '2026-08-03T00:00:00.000Z',
        status: 'archived', tags: [], _sig: 'avoid:tag:applied',
      },
    ],
  }), 'utf-8')
  return dir
}

function writeLegacyQueue(dir: string): EvolveQueueFile {
  const backupPath = path.join(dir, 'RULES.md.bak')
  fs.writeFileSync(backupPath, '## 코딩 규칙\n- 적용 전 규칙\n', 'utf-8')
  const queue: EvolveQueueFile = {
    version: 2,
    items: [
      {
        id: 'e1', patternId: 'p1', kind: 'rule', targetLayer: 'rule', status: 'pending',
        draft: '- 예전 대기 후보', dedupeKey: 'p1:rule', createdAt: '2026-08-04T00:00:00.000Z',
      },
      {
        id: 'e2', patternId: 'p2', kind: 'rule', targetLayer: 'rule', status: 'applied',
        draft: '- 예전에 반영한 규칙', dedupeKey: 'p2:rule', createdAt: '2026-08-03T00:00:00.000Z',
        appliedAt: '2026-08-04T00:00:00.000Z', rulesBackupPath: backupPath,
      },
    ],
  }
  fs.writeFileSync(path.join(dir, QUEUE_PATH_REL), JSON.stringify(queue, null, 2) + '\n', 'utf-8')
  return queue
}

describe('인라인 후보 전환 — 기존 queue.json 하위호환', () => {
  const originalCwd = process.cwd()
  const originalInteractive = process.env.VHK_FORCE_INTERACTIVE
  let originalExitCode: typeof process.exitCode
  let dir: string | undefined

  beforeEach(() => {
    originalExitCode = process.exitCode
    process.exitCode = undefined
  })

  afterEach(() => {
    process.chdir(originalCwd)
    if (originalInteractive === undefined) delete process.env.VHK_FORCE_INTERACTIVE
    else process.env.VHK_FORCE_INTERACTIVE = originalInteractive
    process.exitCode = originalExitCode
    vi.useRealTimers()
    vi.restoreAllMocks()
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
    dir = undefined
  })

  it('목록 조회는 예전 대기·반영 상태를 보여주되 큐나 기록 파일을 쓰지 않는다', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    dir = makeProject()
    writeLegacyQueue(dir)
    process.chdir(dir)
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})

    await evolveList({ json: true })

    const items = JSON.parse(String(output.mock.calls.at(-1)?.[0])) as Array<{ id: string; status: string }>
    expect(items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'e1', status: 'pending' }),
      expect.objectContaining({ id: 'e2', status: 'applied' }),
    ]))
    expect(fs.existsSync(path.join(dir, QUEUE_PATH_REL))).toBe(true)
    expect(fs.existsSync(path.join(dir, LEGACY_QUEUE_ARCHIVE_PATH_REL))).toBe(false)
    expect(readEvolveLog(dir)).toEqual([])
  })

  it('실제 변경 직전에 기존 결정을 새 기록으로 옮기고 큐 원본을 로컬 보관한다', () => {
    dir = makeProject()
    const queue = writeLegacyQueue(dir)
    appendEvolveLog(dir, {
      ts: '2026-08-04T00:00:00.000Z',
      suggId: 'e2',
      patternId: 'p2',
      targetLayer: 'rule',
      applied: true,
      rejectReason: null,
    })

    const result = migrateLegacyQueueForMutation(dir, NOW)

    expect(result).toMatchObject({ status: 'migrated', migratedDecisions: 1 })
    expect(fs.existsSync(path.join(dir, QUEUE_PATH_REL))).toBe(false)
    expect(JSON.parse(fs.readFileSync(path.join(dir, LEGACY_QUEUE_ARCHIVE_PATH_REL), 'utf-8')))
      .toEqual(queue)
    const decisions = currentEvolveDecisions(readEvolveLog(dir))
    expect(decisions).toHaveLength(1)
    expect(decisions[0]).toMatchObject({
      event: 'migration',
      suggId: 'e2',
      patternId: 'p2',
      applied: true,
      draft: '- 예전에 반영한 규칙',
      rulesBackupPath: queue.items[1].rulesBackupPath,
    })

    expect(migrateLegacyQueueForMutation(dir, NOW)).toEqual({
      status: 'none',
      migratedDecisions: 0,
    })
    expect(readEvolveLog(dir)).toHaveLength(2)
  })

  it('기존 보관본 내용이 다르면 어느 파일도 덮어쓰거나 지우지 않는다', () => {
    dir = makeProject()
    writeLegacyQueue(dir)
    const archivePath = path.join(dir, LEGACY_QUEUE_ARCHIVE_PATH_REL)
    fs.writeFileSync(archivePath, '{"different":true}\n', 'utf-8')

    expect(() => migrateLegacyQueueForMutation(dir, NOW)).toThrow(/보관본의 내용이 다릅니다/)
    expect(fs.existsSync(path.join(dir, QUEUE_PATH_REL))).toBe(true)
    expect(fs.readFileSync(archivePath, 'utf-8')).toBe('{"different":true}\n')
    expect(readEvolveLog(dir)).toEqual([])
  })

  it('손상된 기존 큐는 보관했다고 가장하지 않고 원본을 그대로 둔다', () => {
    dir = makeProject()
    const queuePath = path.join(dir, QUEUE_PATH_REL)
    fs.writeFileSync(queuePath, '{broken json\n', 'utf-8')

    expect(() => migrateLegacyQueueForMutation(dir, NOW)).toThrow(/읽지 못했습니다/)
    expect(fs.readFileSync(queuePath, 'utf-8')).toBe('{broken json\n')
    expect(fs.existsSync(path.join(dir, LEGACY_QUEUE_ARCHIVE_PATH_REL))).toBe(false)
    expect(readEvolveLog(dir)).toEqual([])
  })

  it('예전 승인 건을 되돌리기 전에는 새 승인으로 백업을 덮어쓰지 않는다', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    dir = makeProject()
    const queue = writeLegacyQueue(dir)
    const originalBackup = fs.readFileSync(queue.items[1].rulesBackupPath as string, 'utf-8')
    process.chdir(dir)
    process.env.VHK_FORCE_INTERACTIVE = '1'
    const prompt = vi.mocked(inquirer.prompt)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { evolveApply } = await import('../src/commands/evolve.js')
    await evolveApply('e1')

    expect(process.exitCode).toBe(1)
    expect(prompt).not.toHaveBeenCalled()
    expect(fs.readFileSync(queue.items[1].rulesBackupPath as string, 'utf-8')).toBe(originalBackup)
    expect(fs.existsSync(path.join(dir, QUEUE_PATH_REL))).toBe(true)
  })

  it('예전 승인 건도 되돌린 뒤 결정 기록을 해제하고 큐를 보관한다', async () => {
    dir = makeProject()
    const queue = writeLegacyQueue(dir)
    process.chdir(dir)
    process.env.VHK_FORCE_INTERACTIVE = '1'
    vi.mocked(inquirer.prompt).mockResolvedValue({ confirmed: true })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { evolveUndo } = await import('../src/commands/evolve.js')
    await evolveUndo()

    expect(process.exitCode).not.toBe(1)
    expect(fs.readFileSync(path.join(dir, 'RULES.md'), 'utf-8')).toBe(
      fs.readFileSync(queue.items[1].rulesBackupPath as string, 'utf-8'),
    )
    expect(fs.existsSync(path.join(dir, QUEUE_PATH_REL))).toBe(false)
    expect(fs.existsSync(path.join(dir, LEGACY_QUEUE_ARCHIVE_PATH_REL))).toBe(true)
    expect(currentEvolveDecisions(readEvolveLog(dir))).toEqual([])
    const memory = JSON.parse(fs.readFileSync(path.join(dir, '.vhk', 'memory.json'), 'utf-8')) as {
      patterns: Array<{ id: string; status: string }>
    }
    expect(memory.patterns.find((pattern) => pattern.id === 'p2')?.status).toBe('active')
  })
})
