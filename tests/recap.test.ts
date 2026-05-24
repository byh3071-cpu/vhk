import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockIsGitRepo = vi.fn()
const mockHasAnyCommits = vi.fn()
const mockGetSessionDiff = vi.fn()
const mockGetRecentCommits = vi.fn()

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

vi.mock('inquirer', () => ({
  default: { prompt: () => Promise.resolve({}) },
}))

describe('vhk recap', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
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
})
