import { describe, it, expect, vi, beforeEach } from 'vitest'
import { execSync, execFileSync } from 'node:child_process'
import { formatDefaultCommitMessage } from '../src/commands/save.js'
import { t } from '../src/i18n/ko.js'

vi.mock('node:child_process')
vi.mock('inquirer')
vi.mock('ora', () => ({
  default: () => ({
    start: () => ({ text: '', succeed: vi.fn(), fail: vi.fn() }),
  }),
}))

describe('save', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('git 저장소가 아니면 에러 메시지 출력', async () => {
    vi.mocked(execSync).mockImplementationOnce(() => {
      throw new Error('not a git repo')
    })
    const { save } = await import('../src/commands/save.js')
    await expect(save()).resolves.not.toThrow()
    expect(execSync).toHaveBeenCalled()
  })

  it('변경사항 없으면 안내 메시지 출력', async () => {
    vi.mocked(execSync).mockReturnValueOnce(Buffer.from('true'))
    vi.mocked(execFileSync).mockImplementation((_file, args) => {
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
