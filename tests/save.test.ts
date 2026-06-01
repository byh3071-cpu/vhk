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
vi.mock('../src/lib/scan-secrets.js', () => ({
  scanProjectForSecrets: vi.fn(() => ({ findings: [], scannedFiles: 0, truncated: false })),
  filterSevereFindings: vi.fn(() => []),
}))
const mockGetGitRoot = vi.fn(() => '/repo')
const mockGitOut = vi.fn()
const mockGitRun = vi.fn()
const mockHasGitRemote = vi.fn()

vi.mock('../src/lib/git-repo.js', () => ({
  getGitRoot: (...args: unknown[]) => mockGetGitRoot(...args),
  gitOut: (...args: unknown[]) => mockGitOut(...args),
  gitRun: (...args: unknown[]) => mockGitRun(...args),
  hasGitRemote: (...args: unknown[]) => mockHasGitRemote(...args),
  getExecErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}))

describe('save', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    mockGetGitRoot.mockReturnValue('/repo')
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
  })

  it('remote 없으면 push 없이 로컬 성공', async () => {
    vi.mocked(execFileSync).mockImplementation((_file, args) => {
      if (Array.isArray(args) && args[0] === 'rev-parse') return 'true'
      return ''
    })
    mockGitOut.mockImplementation((args: string[]) => {
      if (args[0] === 'status') return ' M file.ts'
      return ''
    })
    mockHasGitRemote.mockReturnValue(false)
    vi.mocked(inquirer.prompt).mockResolvedValueOnce({ message: 'test' })
    const { save } = await import('../src/commands/save.js')
    await save()
    expect(mockGitRun).not.toHaveBeenCalledWith(['push'], '/repo')
  })

  it('push 실패 시 exitCode 1', async () => {
    vi.mocked(execFileSync).mockImplementation((_file, args) => {
      if (Array.isArray(args) && args[0] === 'rev-parse') return 'true'
      return ''
    })
    mockGitOut.mockReturnValue(' M file.ts')
    mockHasGitRemote.mockReturnValue(true)
    mockGitRun.mockImplementation((args: string[]) => {
      if (args[0] === 'push') throw new Error('rejected')
    })
    vi.mocked(inquirer.prompt).mockResolvedValueOnce({ message: 'test' })
    const exitBefore = process.exitCode
    const { save } = await import('../src/commands/save.js')
    await save()
    expect(process.exitCode).toBe(1)
    process.exitCode = exitBefore
  })

  it('비-TTY 면 커밋 메시지 inquirer 없이 기본값(chore: vhk save) 사용', async () => {
    // vitest = 비-TTY (stdin.isTTY undefined). promptOrDefault 가 ask() 미호출 → fallback.
    const ttyBefore = process.stdin.isTTY
    Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true })
    try {
      vi.mocked(execFileSync).mockImplementation((_file, args) => {
        if (Array.isArray(args) && args[0] === 'rev-parse') return 'true'
        return ''
      })
      mockGitOut.mockImplementation((args: string[]) => {
        if (args[0] === 'status') return ' M file.ts'
        return ''
      })
      mockHasGitRemote.mockReturnValue(false)
      const { save } = await import('../src/commands/save.js')
      await expect(save()).resolves.not.toThrow()
      // inquirer 프롬프트 미호출 (비대화형 = stdin 미접근, MCP 안전)
      expect(vi.mocked(inquirer.prompt)).not.toHaveBeenCalled()
      // 커밋은 fallback 메시지로 수행
      expect(mockGitRun).toHaveBeenCalledWith(['commit', '-m', 'chore: vhk save'], '/repo')
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: ttyBefore, configurable: true })
    }
  })

  it('commit 실패 시 staged 안내', async () => {
    vi.mocked(execFileSync).mockImplementation((_file, args) => {
      if (Array.isArray(args) && args[0] === 'rev-parse') return 'true'
      return ''
    })
    mockGitOut.mockImplementation((args: string[]) => {
      if (args[0] === 'status') return ' M file.ts'
      if (args[0] === 'diff') return ' file.ts | 1 +'
      return ''
    })
    mockGitRun.mockImplementation((args: string[]) => {
      if (args[0] === 'commit') throw new Error('commit failed')
    })
    vi.mocked(inquirer.prompt).mockResolvedValueOnce({ message: 'test' })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { save } = await import('../src/commands/save.js')
    await save()
    expect(logSpy.mock.calls.some(c => String(c).includes('git reset HEAD'))).toBe(true)
  })
})

describe('vhk save helpers', () => {
  it('formatDefaultCommitMessage — vhk save 접두사', () => {
    const msg = formatDefaultCommitMessage(new Date('2026-05-23T15:30:00'))
    expect(msg).toBe('✨ vhk save: 2026-05-23 15:30')
  })

  it('t(save.*) — i18n 키 조회', () => {
    expect(t('save.title')).toBe('저장하기')
    expect(t('save.pushFailed')).toContain('push')
  })
})
