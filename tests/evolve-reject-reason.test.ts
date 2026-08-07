import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { evolveReject } from '../src/commands/evolve.js'
import { readEvolveLog } from '../src/lib/evolve-log.js'

// #374 (evolve효과): evolveReject 에 optional reason 인자 → 로그(applied:false,rejectReason) 기록.

function tmpProject(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-reject-'))
  fs.mkdirSync(path.join(d, '.vhk'), { recursive: true })
  fs.writeFileSync(path.join(d, '.vhk', 'memory.json'), JSON.stringify({
    schemaVersion: 2,
    decisions: [],
    failures: [],
    successes: [],
    patterns: [{
      id: 'p1', kind: 'avoid', axis: 'tag', signal: 'build', count: 3,
      sources: [], summary: '반복 실패', createdAt: new Date().toISOString(),
      status: 'active', tags: [], _sig: 'avoid:tag:build',
    }],
  }), 'utf-8')
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

    await evolveReject('p1:rule')

    const log = readEvolveLog(d)
    expect(log).toHaveLength(1)
    expect(log[0].suggId).toBe('p1:rule')
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

    await evolveReject('p1:rule', '중복 룰')

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

    await evolveReject('p1:rule', '첫 사유')
    await evolveReject('p1:rule', '두번째 호출')

    const log = readEvolveLog(d)
    expect(log).toHaveLength(1)
    expect(log[0].rejectReason).toBe('첫 사유')
    process.chdir(origCwd)
    fs.rmSync(d, { recursive: true, force: true })
  })
})
