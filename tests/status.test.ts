import { describe, it, expect, vi, beforeEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import {
  countFileChanges,
  parseSyncCounts,
  formatSyncLabel,
  selectStatusNextStep,
  summarizeUnstartedGoals,
} from '../src/commands/status.js'
import { t } from '../src/i18n/ko.js'

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

  it('VHK-013: 최근 커밋 헤더 숫자 = 실제 나열 개수(하드코딩 3 아님)', () => {
    expect(t('status.recentCommits', 2)).toBe('최근 커밋 (2):')
    expect(t('status.recentCommits', 0)).toBe('최근 커밋 (0):')
  })
})

describe('status — 안전한 다음 액션 (배치3 §2: diff 우선)', () => {
  it('변경사항이 있으면 vhk save 가 아니라 vhk diff 를 먼저 추천', () => {
    const step = selectStatusNextStep(true)
    expect(step.command).toBe('vhk diff')
    expect(step.command).not.toBe('vhk save')
    // 저장은 그 다음(대안) 액션으로만 안내
    expect(step.alternative ?? '').toMatch(/save|저장/)
  })

  it('클린 상태면 다음 미션(goal next) 추천', () => {
    const step = selectStatusNextStep(false)
    expect(step.command).toBe('vhk goal next')
  })
})

describe('status — 미착수 작업 나이 요약', () => {
  it('NOT_STARTED만 세고 created 기준 최고령 일수를 계산', () => {
    const goals = [
      { filePath: 'a', frontmatter: { id: 1, status: 'NOT_STARTED', created: '2026-08-01' }, body: '' },
      { filePath: 'b', frontmatter: { id: 2, status: 'DONE', created: '2026-07-01' }, body: '' },
      { filePath: 'c', frontmatter: { id: 3, status: 'NOT_STARTED', created: '2026-08-04' }, body: '' },
    ]
    expect(summarizeUnstartedGoals(goals, new Date('2026-08-05T12:00:00Z'))).toEqual({
      count: 2,
      oldestDays: 4,
    })
  })

  it('자정 직후에도 시간 차가 아니라 현지 달력 날짜 차이로 계산', () => {
    const goals = [
      { filePath: 'a', frontmatter: { id: 1, status: 'NOT_STARTED', created: '2026-08-01' }, body: '' },
    ]
    expect(summarizeUnstartedGoals(goals, new Date(2026, 7, 5, 0, 5))).toEqual({
      count: 1,
      oldestDays: 4,
    })
  })
})
