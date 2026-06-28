import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockIsGitRepo = vi.fn()
const mockHasAnyCommits = vi.fn()
const mockGetSessionDiff = vi.fn()
const mockGetRecentCommits = vi.fn()
const mockPrompt = vi.fn()
const mockWriteFileSync = vi.fn()

vi.mock('../src/lib/git.js', () => ({
  isGitRepo: (...a: unknown[]) => mockIsGitRepo(...a),
  hasAnyCommits: (...a: unknown[]) => mockHasAnyCommits(...a),
  getSessionDiff: (...a: unknown[]) => mockGetSessionDiff(...a),
  getRecentCommits: (...a: unknown[]) => mockGetRecentCommits(...a),
}))

vi.mock('../src/lib/check-secure.js', () => ({
  printSecurityWarnings: () => {},
  filterTrackedPaths: (p: string[]) => p,
}))

vi.mock('../src/lib/adr.js', () => ({
  detectAdrCandidates: () => [],
  createAdrFile: () => '',
}))

// #288 비-TTY 테스트가 실 레포에 docs/log 파일을 쓰지 않도록 fs 격리(writeFileSync 만 spy).
vi.mock('node:fs', () => {
  const m = {
    existsSync: () => false,
    mkdirSync: () => undefined,
    readdirSync: () => [] as string[],
    writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
    readFileSync: () => '',
  }
  return { default: m, ...m }
})

vi.mock('../src/lib/doc-suggest.js', () => ({
  detectTroubleshootingCommits: () => [],
}))

vi.mock('../src/lib/troubleshooting.js', () => ({
  createTroubleshootingFile: () => '',
}))

// HARD_STOP 가드는 state-files/action-ledger 경유로 fs 를 타므로 직접 모킹(차단 아님 = 진행).
vi.mock('../src/lib/hard-stop-guard.js', () => ({
  ensureNotHardStopped: () => true,
}))

vi.mock('inquirer', () => ({
  default: { prompt: (...a: unknown[]) => mockPrompt(...a) },
}))

function setTTY(value: boolean | undefined): boolean | undefined {
  const orig = process.stdin.isTTY
  Object.defineProperty(process.stdin, 'isTTY', { value, configurable: true })
  return orig
}

describe('vhk recap', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockPrompt.mockResolvedValue({})
  })

  it('Git 레포가 아니면 안내만 출력하고 종료한다', async () => {
    mockIsGitRepo.mockResolvedValue(false)
    const { recap } = await import('../src/commands/recap.js')
    await recap()
    expect(mockGetSessionDiff).not.toHaveBeenCalled()
    expect(mockGetRecentCommits).not.toHaveBeenCalled()
  })

  it('커밋이 0개인 신규 레포에서는 안내만 출력하고 종료 (회귀 가드: simple-git GitError throw)', async () => {
    mockIsGitRepo.mockResolvedValue(true)
    mockHasAnyCommits.mockResolvedValue(false)
    const { recap } = await import('../src/commands/recap.js')
    await recap()
    // 가드 통과 시 호출되는 단계가 실행되지 않아야 함
    expect(mockGetSessionDiff).not.toHaveBeenCalled()
    expect(mockGetRecentCommits).not.toHaveBeenCalled()
  })

  it('변경/커밋 둘 다 0이면 noChanges 메시지 후 inquirer 호출 없이 종료', async () => {
    mockIsGitRepo.mockResolvedValue(true)
    mockHasAnyCommits.mockResolvedValue(true)
    mockGetSessionDiff.mockResolvedValue({
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
      files: [],
    })
    mockGetRecentCommits.mockResolvedValue([])
    const { recap } = await import('../src/commands/recap.js')
    await recap()
    expect(mockGetSessionDiff).toHaveBeenCalled()
    expect(mockGetRecentCommits).toHaveBeenCalled()
  })

  describe('#288 비-TTY(헤드리스 AI·파이프) 비대화형 경로', () => {
    let origTTY: boolean | undefined
    let origExit: typeof process.exitCode

    beforeEach(() => {
      origTTY = setTTY(false) // 비-TTY 강제
      origExit = process.exitCode
      process.exitCode = 0
      mockIsGitRepo.mockResolvedValue(true)
      mockHasAnyCommits.mockResolvedValue(true)
    })

    afterEach(() => {
      setTTY(origTTY)
      process.exitCode = origExit
    })

    it('프롬프트 없이 세션 로그를 쓰고 정상 종료한다 (TTY_REQUIRED exit 2 아님)', async () => {
      mockGetSessionDiff.mockResolvedValue({
        filesChanged: 2,
        insertions: 10,
        deletions: 1,
        files: [{ file: 'src/a.ts', status: 'modified' }],
      })
      mockGetRecentCommits.mockResolvedValue([{ hash: 'abc1234', message: 'fix: x' }])

      const { recap } = await import('../src/commands/recap.js')
      await recap({})

      expect(mockPrompt).not.toHaveBeenCalled() // 헤드리스 inquirer 금지 준수
      expect(mockWriteFileSync).toHaveBeenCalled() // 세션 로그 실제 생성
      expect(process.exitCode).not.toBe(2) // 과거 TTY_REQUIRED 중단이 사라짐
    })

    it('--summary/--next 플래그가 회고 본문에 반영된다', async () => {
      mockGetSessionDiff.mockResolvedValue({
        filesChanged: 1,
        insertions: 5,
        deletions: 0,
        files: [{ file: 'src/a.ts', status: 'modified' }],
      })
      mockGetRecentCommits.mockResolvedValue([])

      const { recap } = await import('../src/commands/recap.js')
      await recap({ summary: '로그인 화면 구현', next: '테스트 추가' })

      expect(mockPrompt).not.toHaveBeenCalled()
      const content = mockWriteFileSync.mock.calls[0]?.[1] as string
      expect(content).toContain('로그인 화면 구현')
      expect(content).toContain('테스트 추가')
    })

    it('플래그 미지정 항목은 "미입력" 표식으로 기록(거짓 본문 날조 금지)', async () => {
      mockGetSessionDiff.mockResolvedValue({
        filesChanged: 1,
        insertions: 5,
        deletions: 0,
        files: [{ file: 'src/a.ts', status: 'modified' }],
      })
      mockGetRecentCommits.mockResolvedValue([])

      const { recap } = await import('../src/commands/recap.js')
      await recap({}) // 플래그 전무

      const content = mockWriteFileSync.mock.calls[0]?.[1] as string
      expect(content).toContain('미입력') // summary·nextTodo 가 미입력 표식
    })
  })
})
