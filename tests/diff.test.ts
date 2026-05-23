import { describe, it, expect, vi, beforeEach } from 'vitest'
import { execSync, execFileSync } from 'node:child_process'
import { parseDiffStat, summarizeNumstat } from '../src/commands/diff.js'

vi.mock('node:child_process')

describe('diff', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('git 저장소가 아니면 에러 메시지 출력', async () => {
    vi.mocked(execSync).mockImplementationOnce(() => {
      throw new Error('not a git repo')
    })
    const { diff } = await import('../src/commands/diff.js')
    await expect(diff()).resolves.not.toThrow()
    expect(execSync).toHaveBeenCalled()
  })

  it('변경 없으면 안내 메시지 출력', async () => {
    vi.mocked(execSync).mockReturnValueOnce(Buffer.from('true'))
    vi.mocked(execFileSync).mockReturnValue('')
    const { diff } = await import('../src/commands/diff.js')
    await expect(diff()).resolves.not.toThrow()
  })
})

describe('vhk diff helpers', () => {
  it('parseDiffStat — git diff --stat 파싱', () => {
    const stat = [
      ' src/foo.ts | 10 ++++++++++',
      ' 2 files changed, 10 insertions(+)',
    ].join('\n')

    const files = parseDiffStat(stat)
    expect(files).toHaveLength(1)
    expect(files[0].name).toBe('src/foo.ts')
    expect(files[0].additions).toBe(10)
  })

  it('summarizeNumstat — 줄 수 합산', () => {
    const numstat = '10\t2\tsrc/a.ts\n5\t1\tsrc/b.ts'
    const sum = summarizeNumstat(numstat)
    expect(sum.fileCount).toBe(2)
    expect(sum.totalAdd).toBe(15)
    expect(sum.totalDel).toBe(3)
  })
})
