import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { evolveReject, QUEUE_PATH_REL, type EvolveQueueFile } from '../src/commands/evolve.js'
import { readEvolveLog } from '../src/lib/evolve-log.js'

// #374 (evolve효과): evolveReject 에 optional reason 인자 → 로그(applied:false,rejectReason) 기록.

function tmpProject(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-reject-'))
  const queue: EvolveQueueFile = {
    version: 2,
    items: [
      {
        id: 'e1',
        patternId: 'p1',
        kind: 'rule',
        targetLayer: 'rule',
        status: 'pending',
        draft: '- 초안',
        dedupeKey: 'p1:rule',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ],
  }
  fs.mkdirSync(path.join(d, '.vhk', 'evolve'), { recursive: true })
  fs.writeFileSync(path.join(d, QUEUE_PATH_REL), JSON.stringify(queue, null, 2), 'utf-8')
  return d
}

describe('evolveReject — reason 인자 (#374)', () => {
  let origCwd: string
  let logSpy: ReturnType<typeof vi.spyOn>

  afterEach(() => {
    logSpy?.mockRestore()
    if (origCwd) process.chdir(origCwd)
    process.exitCode = 0
  })

  it('reason 없이 reject → evolve-log 에 rejectReason:null 로 1줄 기록(하위호환 회귀)', async () => {
    const d = tmpProject()
    origCwd = process.cwd()
    process.chdir(d)
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await evolveReject('e1')

    const log = readEvolveLog(d)
    expect(log).toHaveLength(1)
    expect(log[0].suggId).toBe('e1')
    expect(log[0].applied).toBe(false)
    expect(log[0].rejectReason).toBeNull()
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('reason 전달 → evolve-log 에 그대로 기록', async () => {
    const d = tmpProject()
    origCwd = process.cwd()
    process.chdir(d)
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await evolveReject('e1', '중복 룰')

    const log = readEvolveLog(d)
    expect(log).toHaveLength(1)
    expect(log[0].rejectReason).toBe('중복 룰')
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('존재하지 않는 id → 로그 미기록(에러 안내만)', async () => {
    const d = tmpProject()
    origCwd = process.cwd()
    process.chdir(d)
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await evolveReject('e999')

    expect(readEvolveLog(d)).toEqual([])
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('이미 rejected 인 항목 재호출 → 로그 중복 기록 안 함(변경 없음 분기)', async () => {
    const d = tmpProject()
    origCwd = process.cwd()
    process.chdir(d)
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await evolveReject('e1', '첫 사유')
    await evolveReject('e1', '두번째 호출')

    const log = readEvolveLog(d)
    expect(log).toHaveLength(1)
    expect(log[0].rejectReason).toBe('첫 사유')
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })
})
