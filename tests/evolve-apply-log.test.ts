import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import inquirer from 'inquirer'
import { QUEUE_PATH_REL, type EvolveQueueFile } from '../src/commands/evolve.js'
import { readEvolveLog } from '../src/lib/evolve-log.js'

vi.mock('inquirer')

// #374 (evolve효과): evolveApply 가 확정(applied) 시점에 evolve-log 에 1줄 append 하는지 통합 검증.
// TTY 필요 명령이라 VHK_FORCE_INTERACTIVE + inquirer mock 으로 대화형을 흉내낸다(save.test.ts 패턴).

function tmpProject(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-apply-'))
  fs.writeFileSync(path.join(d, 'RULES.md'), '## 코딩 규칙\n- 기존 룰 하나\n')
  const queue: EvolveQueueFile = {
    version: 2,
    items: [
      {
        id: 'e1',
        patternId: 'p1',
        kind: 'rule',
        targetLayer: 'rule',
        status: 'pending',
        draft: '- 신규 초안 룰',
        dedupeKey: 'p1:rule',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ],
  }
  fs.mkdirSync(path.join(d, '.vhk', 'evolve'), { recursive: true })
  fs.writeFileSync(path.join(d, QUEUE_PATH_REL), JSON.stringify(queue, null, 2), 'utf-8')
  return d
}

describe('evolveApply — applied 확정 시 evolve-log append (#374)', () => {
  let origCwd: string
  let origForceInteractive: string | undefined
  let logSpy: ReturnType<typeof vi.spyOn>

  afterEach(() => {
    logSpy?.mockRestore()
    if (origCwd) process.chdir(origCwd)
    if (origForceInteractive === undefined) delete process.env.VHK_FORCE_INTERACTIVE
    else process.env.VHK_FORCE_INTERACTIVE = origForceInteractive
    process.exitCode = 0
    vi.restoreAllMocks()
  })

  it('apply 확정 → evolve-log 에 applied:true, rejectReason:null 1줄 기록', async () => {
    const d = tmpProject()
    origCwd = process.cwd()
    origForceInteractive = process.env.VHK_FORCE_INTERACTIVE
    process.env.VHK_FORCE_INTERACTIVE = '1'
    process.chdir(d)
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.mocked(inquirer.prompt)
      .mockResolvedValueOnce({ editedDraft: '- 신규 초안 룰' })
      .mockResolvedValueOnce({ confirmed: true })

    const { evolveApply } = await import('../src/commands/evolve.js')
    await evolveApply('e1')

    const log = readEvolveLog(d)
    expect(log).toHaveLength(1)
    expect(log[0].suggId).toBe('e1')
    expect(log[0].applied).toBe(true)
    expect(log[0].rejectReason).toBeNull()
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('사용자가 confirm 취소 → evolve-log 미기록(반영 자체가 취소됨)', async () => {
    const d = tmpProject()
    origCwd = process.cwd()
    origForceInteractive = process.env.VHK_FORCE_INTERACTIVE
    process.env.VHK_FORCE_INTERACTIVE = '1'
    process.chdir(d)
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.mocked(inquirer.prompt)
      .mockResolvedValueOnce({ editedDraft: '- 신규 초안 룰' })
      .mockResolvedValueOnce({ confirmed: false })

    const { evolveApply } = await import('../src/commands/evolve.js')
    await evolveApply('e1')

    expect(readEvolveLog(d)).toEqual([])
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })
})
