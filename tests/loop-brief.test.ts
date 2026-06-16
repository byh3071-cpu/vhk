import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExistsSync = vi.fn()
const mockReadFileSync = vi.fn()
const mockWriteFileSync = vi.fn()
const mockMkdirSync = vi.fn()

const mockListGoals = vi.fn()
const mockSelectActiveId = vi.fn()
const mockReadMemory = vi.fn()
const mockRecallForAction = vi.fn()
const mockIsHardStopActive = vi.fn()
const mockGetActiveBlockers = vi.fn()

vi.mock('node:fs', () => ({
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
  writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
  mkdirSync: (...a: unknown[]) => mockMkdirSync(...a),
}))
vi.mock('../src/lib/goal-frontmatter.js', () => ({
  listGoals: (...a: unknown[]) => mockListGoals(...a),
}))
vi.mock('../src/commands/goal.js', () => ({
  selectActiveId: (...a: unknown[]) => mockSelectActiveId(...a),
}))
vi.mock('../src/commands/memory.js', () => ({
  readMemory: (...a: unknown[]) => mockReadMemory(...a),
  recallForAction: (...a: unknown[]) => mockRecallForAction(...a),
}))
vi.mock('../src/lib/state-files.js', () => ({
  isHardStopActive: (...a: unknown[]) => mockIsHardStopActive(...a),
  getActiveBlockers: (...a: unknown[]) => mockGetActiveBlockers(...a),
}))

const VISION = (whatLine: string, whatHeading = '## What (한 줄)') =>
  `# VISION — t\n\n${whatHeading}\n${whatLine}\n\n## Why (북극성)\n이유\n\n## Loop Anchor (루프가 매 틱 지킬 것)\n- 한 번에 goal 1개.\n- 의심되면 멈추고 사람 확인.\n`

function writtenMd(): string {
  const call = mockWriteFileSync.mock.calls.find((c) => String(c[0]).includes('loop-brief.md'))
  return call ? String(call[1]) : ''
}

describe('loop-brief', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    // 기본: goal/recall/blocker 없음 (graceful 경로)
    mockListGoals.mockReturnValue([])
    mockSelectActiveId.mockReturnValue(null)
    mockReadMemory.mockReturnValue({})
    mockRecallForAction.mockReturnValue([])
    mockIsHardStopActive.mockReturnValue(false)
    mockGetActiveBlockers.mockReturnValue([])
  })

  it('VISION.md 의 What·Loop Anchor 가 모두 loop-brief.md 에 들어간다', async () => {
    mockExistsSync.mockImplementation((p: unknown) => String(p) === 'VISION.md')
    mockReadFileSync.mockReturnValue(VISION('AI 코딩 세션을 묶는 한국어 CLI'))
    const { loopBrief } = await import('../src/commands/loop-brief.js')
    loopBrief()
    const md = writtenMd()
    expect(md).toContain('AI 코딩 세션을 묶는 한국어 CLI')
    expect(md).toContain('한 번에 goal 1개.')
  })

  it("What 본문의 '#'(C# 등)이 잘리지 않는다 (회귀 #1)", async () => {
    mockExistsSync.mockImplementation((p: unknown) => String(p) === 'VISION.md')
    mockReadFileSync.mockReturnValue(VISION('C# 으로 만드는 도구'))
    const { loopBrief } = await import('../src/commands/loop-brief.js')
    loopBrief()
    expect(writtenMd()).toContain('C# 으로 만드는 도구')
  })

  it('What 헤딩 변형(괄호 없는 `## What`)도 파싱된다 (헤딩 표류 내성)', async () => {
    mockExistsSync.mockImplementation((p: unknown) => String(p) === 'VISION.md')
    mockReadFileSync.mockReturnValue(VISION('헤딩 변형 본문', '## What'))
    const { loopBrief } = await import('../src/commands/loop-brief.js')
    loopBrief()
    expect(writtenMd()).toContain('헤딩 변형 본문')
  })

  it('VISION.md 부재 시 폴백 문구 + 크래시 없음', async () => {
    mockExistsSync.mockReturnValue(false)
    const { loopBrief } = await import('../src/commands/loop-brief.js')
    expect(() => loopBrief()).not.toThrow()
    expect(writtenMd()).toContain('VISION.md 없음')
  })

  it('content 빈 실패교훈(lesson 필드만)도 recall 섹션에 렌더된다 (회귀 #2)', async () => {
    mockExistsSync.mockReturnValue(false)
    mockSelectActiveId.mockReturnValue(7)
    mockListGoals.mockReturnValue([{ filePath: 'goals/7-x.md', frontmatter: { id: 7, title: 't', status: 'IN_PROGRESS' }, body: '' }])
    mockRecallForAction.mockReturnValue([
      { entry: { id: 'f1', content: '', lesson: '클램프 없는 라우트 위험', tags: [], createdAt: '', status: 'open' }, bucket: 'fail', score: 1, signals: {} },
    ])
    const { loopBrief } = await import('../src/commands/loop-brief.js')
    loopBrief()
    const md = writtenMd()
    expect(md).toContain('클램프 없는 라우트 위험')
    expect(md).not.toContain('관련 교훈 없음')
  })

  it('HARD_STOP 활성 메시지의 마크다운 볼드 마커가 균형 잡힌다 (회귀 #3)', async () => {
    mockExistsSync.mockReturnValue(false)
    mockIsHardStopActive.mockReturnValue(true)
    const { loopBrief } = await import('../src/commands/loop-brief.js')
    loopBrief()
    const md = writtenMd()
    const stopLine = md.split('\n').find((l) => l.includes('HARD_STOP')) ?? ''
    // '**' 개수가 짝수여야 볼드가 번지지 않는다.
    expect((stopLine.match(/\*\*/g) ?? []).length % 2).toBe(0)
  })

  it('활성 goal/blocker 없어도 graceful (빈 섹션 안내)', async () => {
    mockExistsSync.mockReturnValue(false)
    const { loopBrief } = await import('../src/commands/loop-brief.js')
    loopBrief()
    const md = writtenMd()
    expect(md).toContain('활성 goal 없음')
    expect(md).toContain('블로커: 없음')
  })
})
