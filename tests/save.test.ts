import { describe, it, expect, vi, beforeEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import inquirer from 'inquirer'
import { formatChangeSummaryMessage } from '../src/commands/save.js'
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
const mockHasGitRemote = vi.fn()

vi.mock('../src/lib/git-repo.js', () => ({
  getGitRoot: (...args: unknown[]) => mockGetGitRoot(...args),
  hasGitRemote: (...args: unknown[]) => mockHasGitRemote(...args),
  getExecErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}))

// Goal 48: save 는 git-session 공유 함수로 git 질문을 한다(MCP 와 동일 SoT) → 그 seam 을 mock.
// rev-parse 게이트는 여전히 execFileSync 직접 호출(위 node:child_process mock).
const mockStatusPorcelain = vi.fn()
const mockStageAll = vi.fn()
const mockCommit = vi.fn()
const mockPush = vi.fn()
const mockStagedStat = vi.fn()

vi.mock('../src/lib/git-session.js', () => ({
  statusPorcelain: (...a: unknown[]) => mockStatusPorcelain(...a),
  stageAll: (...a: unknown[]) => mockStageAll(...a),
  commit: (...a: unknown[]) => mockCommit(...a),
  push: (...a: unknown[]) => mockPush(...a),
  stagedStat: (...a: unknown[]) => mockStagedStat(...a),
  okOut: (r: { ok: boolean; out: string }) => (r && r.ok ? r.out : ''),
}))

const OK = (out = '') => ({ ok: true as const, out })

describe('save', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    mockGetGitRoot.mockReturnValue('/repo')
    // 기본: 모든 git-session 호출 성공 (변경사항 1건 있는 상태)
    mockStatusPorcelain.mockReturnValue(OK(' M file.ts'))
    mockStageAll.mockReturnValue(OK())
    mockCommit.mockReturnValue(OK())
    mockPush.mockReturnValue(OK())
    mockStagedStat.mockReturnValue(OK())
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
    mockHasGitRemote.mockReturnValue(false)
    vi.mocked(inquirer.prompt).mockResolvedValueOnce({ message: 'test' })
    const { save } = await import('../src/commands/save.js')
    await save()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('push 실패 시 exitCode 1', async () => {
    vi.mocked(execFileSync).mockImplementation((_file, args) => {
      if (Array.isArray(args) && args[0] === 'rev-parse') return 'true'
      return ''
    })
    mockHasGitRemote.mockReturnValue(true)
    mockPush.mockReturnValue({ ok: false, err: 'rejected', out: '' })
    vi.mocked(inquirer.prompt).mockResolvedValueOnce({ message: 'test' })
    const exitBefore = process.exitCode
    const { save } = await import('../src/commands/save.js')
    await save()
    expect(process.exitCode).toBe(1)
    process.exitCode = exitBefore
  })

  it('#286: 비-TTY 면 inquirer 없이 변경요약 fallback 메시지로 커밋 (고정 chore: vhk save 아님)', async () => {
    // vitest = 비-TTY (stdin.isTTY undefined). promptOrDefault 가 ask() 미호출 → fallback.
    const ttyBefore = process.stdin.isTTY
    Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true })
    try {
      vi.mocked(execFileSync).mockImplementation((_file, args) => {
        if (Array.isArray(args) && args[0] === 'rev-parse') return 'true'
        return ''
      })
      mockHasGitRemote.mockReturnValue(false)
      const { save } = await import('../src/commands/save.js')
      await expect(save()).resolves.not.toThrow()
      // inquirer 프롬프트 미호출 (비대화형 = stdin 미접근, MCP 안전)
      expect(vi.mocked(inquirer.prompt)).not.toHaveBeenCalled()
      // #286: fallback 도 변경 파일 반영 (' M file.ts' → file.ts). 고정 메시지였던 회귀 방지.
      expect(mockCommit).toHaveBeenCalledWith('chore: vhk save — file.ts', '/repo')
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: ttyBefore, configurable: true })
    }
  })

  it('#154: --message 제공 시 프롬프트 없이 그 메시지로 커밋 (MCP save 파리티)', async () => {
    vi.mocked(execFileSync).mockImplementation((_file, args) => {
      if (Array.isArray(args) && args[0] === 'rev-parse') return 'true'
      return ''
    })
    mockHasGitRemote.mockReturnValue(false)
    const { save } = await import('../src/commands/save.js')
    await save({ message: 'feat: custom MSG123' })
    expect(vi.mocked(inquirer.prompt)).not.toHaveBeenCalled()
    expect(mockCommit).toHaveBeenCalledWith('feat: custom MSG123', '/repo')
  })

  it('commit 실패 시 staged 안내', async () => {
    vi.mocked(execFileSync).mockImplementation((_file, args) => {
      if (Array.isArray(args) && args[0] === 'rev-parse') return 'true'
      return ''
    })
    mockStagedStat.mockReturnValue(OK(' file.ts | 1 +'))
    mockCommit.mockReturnValue({ ok: false, err: 'commit failed', out: '' })
    vi.mocked(inquirer.prompt).mockResolvedValueOnce({ message: 'test' })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { save } = await import('../src/commands/save.js')
    await save()
    expect(logSpy.mock.calls.some(c => String(c).includes('git reset HEAD'))).toBe(true)
  })
})

describe('vhk save helpers', () => {
  describe('formatChangeSummaryMessage (#286)', () => {
    it('단일 파일 — 경로를 메시지에 반영', () => {
      expect(formatChangeSummaryMessage([' M src/commands/save.ts']))
        .toBe('chore: vhk save — src/commands/save.ts')
    })

    it('여러 파일 — 개수 + 목록', () => {
      expect(formatChangeSummaryMessage([' M a.ts', '?? b.ts', ' D c.ts']))
        .toBe('chore: vhk save — 3 files: a.ts, b.ts, c.ts')
    })

    it('rename — "old -> new" 에서 new 경로만 사용', () => {
      expect(formatChangeSummaryMessage(['R  old.ts -> src/new.ts']))
        .toBe('chore: vhk save — src/new.ts')
    })

    it('파일 많으면 subject 상한 내로 자르고 +N more 로 총개수 표기', () => {
      const many = Array.from({ length: 30 }, (_, i) => ` M src/very/long/path/file-${i}.ts`)
      const msg = formatChangeSummaryMessage(many)
      expect(msg.startsWith('chore: vhk save — 30 files: ')).toBe(true)
      expect(msg).toMatch(/ \+\d+ more$/)
      expect(msg).not.toContain('file-29.ts') // 일부만 나열(전부 X)
    })

    it('변경 없음 — prefix 만 (방어)', () => {
      expect(formatChangeSummaryMessage([])).toBe('chore: vhk save')
    })
  })

  it('t(save.*) — i18n 키 조회', () => {
    expect(t('save.title')).toBe('저장하기')
    expect(t('save.pushFailed')).toContain('push')
  })
})
