import { describe, it, expect, vi, beforeEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import {
  countFileChanges,
  parseSyncCounts,
  formatSyncLabel,
} from '../src/commands/status.js'

vi.mock('node:child_process')

describe('status', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('git 없어도 에러 없이 실행', async () => {
    vi.mocked(execFileSync).mockImplementation((_file, args) => {
      if (Array.isArray(args) && args[0] === 'rev-parse') {
        throw new Error('not a git repo')
      }
      return ''
    })
    const { status } = await import('../src/commands/status.js')
    await expect(status()).resolves.not.toThrow()
    expect(execFileSync).toHaveBeenCalled()
  })
})

describe('vhk status helpers', () => {
  it('countFileChanges — staged / unstaged / untracked', () => {
    const porcelain = 'M  staged.ts\n M unstaged.ts\n?? new.ts\n'
    expect(countFileChanges(porcelain)).toEqual({
      staged: 1,
      unstaged: 1,
      untracked: 1,
    })
  })

  it('leading space — trim 하면 unstaged가 staged로 오집계', () => {
    const wrong = ' M unstaged.ts\n'.trim()
    expect(countFileChanges(wrong).unstaged).toBe(0)
    expect(countFileChanges(' M unstaged.ts\n').unstaged).toBe(1)
  })

  it('formatSyncLabel — upstream 없음', () => {
    expect(formatSyncLabel({ ahead: 0, behind: 0, hasUpstream: false })).toContain(
      'upstream',
    )
  })

  it('parseSyncCounts — ahead / behind', () => {
    expect(parseSyncCounts('2\t1')).toEqual({
      ahead: 2,
      behind: 1,
      hasUpstream: true,
    })
  })
})
