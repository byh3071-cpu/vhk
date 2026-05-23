import { describe, it, expect, vi, beforeEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import inquirer from 'inquirer'
import { formatDefaultCommitMessage } from '../src/commands/save.js'
import { t } from '../src/i18n/ko.js'

vi.mock('node:child_process')
vi.mock('inquirer')
vi.mock('ora', () => ({
  default: () => ({
    start: () => ({ text: '', succeed: vi.fn(), fail: vi.fn() }),
  }),
}))
vi.mock('../src/lib/check-secure.js', () => ({
  printSecurityWarnings: vi.fn(() => true),
}))

describe('save', () => {
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
    const { save } = await import('../src/commands/save.js')
    await expect(save()).resolves.not.toThrow()
    expect(execFileSync).toHaveBeenCalled()
  })

  it('commit 실패 시 staged 안내', async () => {
    vi.mocked(inquirer.prompt).mockResolvedValueOnce({ message: 'test commit' })
    vi.mocked(execFileSync).mockImplementation((_file, args) => {
      if (Array.isArray(args) && args[0] === 'rev-parse') return 'true'
      if (Array.isArray(args) && args[0] === 'status') {
        return ' M file.ts'
      }
      if (Array.isArray(args) && args[0] === 'add') return ''
      if (Array.isArray(args) && args[0] === 'commit') {
        throw new Error('commit failed')
      }
      if (Array.isArray(args) && args[0] === 'diff') {
        return ' file.ts | 1 +'
      }
      return ''
    })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { save } = await import('../src/commands/save.js')
    await save()
    expect(logSpy.mock.calls.some(c => String(c).includes('git reset HEAD'))).toBe(true)
    logSpy.mockRestore()
  })

  it('변경사항 없으면 안내 메시지 출력', async () => {
    vi.mocked(execFileSync).mockImplementation((_file, args) => {
      if (Array.isArray(args) && args[0] === 'rev-parse') return 'true'
      if (Array.isArray(args) && args[0] === 'status') return ''
      return ''
    })
    const { save } = await import('../src/commands/save.js')
    await expect(save()).resolves.not.toThrow()
    expect(execFileSync).toHaveBeenCalledWith(
      'git',
      ['status', '--porcelain'],
      expect.objectContaining({ encoding: 'utf-8' }),
    )
  })
})

describe('vhk save helpers', () => {
  it('formatDefaultCommitMessage — vhk save 접두사', () => {
    const msg = formatDefaultCommitMessage(new Date('2026-05-23T15:30:00'))
    expect(msg).toBe('✨ vhk save: 2026-05-23 15:30')
  })

  it('t(save.*) — i18n 키 조회', () => {
    expect(t('save.title')).toBe('저장하기')
    expect(t('save.noChanges')).toBe('저장할 변경사항이 없습니다.')
    expect(t('save.successWithPush')).toBe('저장 + 원격 업로드 완료!')
  })
})
