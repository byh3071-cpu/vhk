import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseDiffStat, summarizeNumstat } from '../src/commands/diff.js'

const mockSafeExecFile = vi.fn()

vi.mock('../src/lib/exec.js', () => ({
  safeExecFile: (...a: unknown[]) => mockSafeExecFile(...a),
}))

describe('diff', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('git 저장소가 아니면 에러 메시지 출력', async () => {
    // rev-parse 실패 → not git repo 경로 진입
    mockSafeExecFile.mockReturnValueOnce({ ok: false, err: 'not a git repo', out: '' })
    const { diff } = await import('../src/commands/diff.js')
    await expect(diff()).resolves.not.toThrow()
    expect(mockSafeExecFile).toHaveBeenCalledWith('git', ['rev-parse', '--is-inside-work-tree'])
  })

  it('변경 없으면 안내 메시지 출력', async () => {
    // rev-parse ok, 이후 모든 git 호출은 빈 출력 → no changes 경로
    mockSafeExecFile.mockReturnValue({ ok: true, out: '' })
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
