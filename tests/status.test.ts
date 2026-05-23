import { describe, it, expect, vi, beforeEach } from 'vitest'
import { execSync } from 'node:child_process'
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
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('not a git repo')
    })
    const { status } = await import('../src/commands/status.js')
    await expect(status()).resolves.not.toThrow()
    expect(execSync).toHaveBeenCalled()
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
