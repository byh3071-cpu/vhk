import { describe, it, expect, vi, beforeEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import {
  parseRecentCommits,
  willUndoPushedCommits,
  isUndoRisky,
} from '../src/commands/undo.js'

vi.mock('node:child_process')
vi.mock('inquirer')

describe('undo', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('git 저장소가 아니면 에러 메시지 출력', async () => {
    vi.mocked(execFileSync).mockImplementation((_file, args) => {
      if (Array.isArray(args) && args[0] === 'rev-parse') {
        throw new Error('not a git repo')
      }
      return ''
    })
    const { undo } = await import('../src/commands/undo.js')
    await expect(undo()).resolves.not.toThrow()
    expect(execFileSync).toHaveBeenCalled()
  })

  it('커밋 없으면 안내 메시지 출력', async () => {
    vi.mocked(execFileSync).mockImplementation((_file, args) => {
      if (Array.isArray(args) && args[0] === 'rev-parse') return 'true'
      if (Array.isArray(args) && args[0] === 'log') {
        throw new Error('no commits')
      }
      return ''
    })
    const { undo } = await import('../src/commands/undo.js')
    await expect(undo()).resolves.not.toThrow()
    expect(execFileSync).toHaveBeenCalledWith(
      'git',
      ['log', '--oneline', '-5'],
      expect.objectContaining({ encoding: 'utf-8' }),
    )
  })
})

describe('vhk undo helpers', () => {
  it('parseRecentCommits — 줄 단위 파싱', () => {
    const lines = parseRecentCommits('abc1234 feat: a\n def5678 fix: b\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('abc1234')
  })

  it('willUndoPushedCommits — unpushed보다 많이 되돌리면 경고', () => {
    expect(willUndoPushedCommits(2, 1)).toBe(true)
    expect(willUndoPushedCommits(1, 1)).toBe(false)
    expect(willUndoPushedCommits(1, -1)).toBe(false)
  })

  it('isUndoRisky — upstream 없고 remote 있으면 위험', () => {
    expect(isUndoRisky(1, -1, true)).toBe(true)
    expect(isUndoRisky(1, -1, false)).toBe(false)
    expect(isUndoRisky(1, 2, true)).toBe(false)
    expect(isUndoRisky(3, 1, true)).toBe(true)
  })
})
