import { describe, it, expect, vi, beforeEach } from 'vitest'

// #456 배선 검증 — 뒷단 4명령 액션이 실제로 RULES.md 를 읽어(readCriticalRules) 프롬프트에
// 상속하는지. 순수 빌더 테스트가 못 잡는 "빌더에 rules 안 넘김" 회귀를 emitPrompt 캡처로 고정.
const mockExistsSync = vi.fn()
const mockReadFileSync = vi.fn()

vi.mock('node:fs', () => ({
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
}))

const emitted: string[] = []
vi.mock('../src/lib/emit-prompt.js', () => ({
  emitPrompt: (prompt: string) => {
    emitted.push(prompt)
  },
}))
vi.mock('../src/lib/next-step.js', () => ({
  printNextStep: () => {},
}))

describe('뒷단 4명령 — RULES.md 상속 배선 (#456)', () => {
  beforeEach(() => {
    emitted.length = 0
    mockExistsSync.mockReset()
    mockReadFileSync.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    // RULES.md 만 존재(VISION.md 없음) — 치명 규칙 1개짜리 최소 픽스처
    mockExistsSync.mockImplementation((p: unknown) => String(p).includes('RULES.md'))
    mockReadFileSync.mockReturnValue('# t\n\n## Forbidden\n- 테스트 치명 규칙 X\n')
  })

  it.each([
    ['content', async () => (await import('../src/commands/content.js')).content()],
    ['launch', async () => (await import('../src/commands/launch.js')).launch()],
    ['ops', async () => (await import('../src/commands/ops.js')).ops()],
    ['sell', async () => (await import('../src/commands/sell.js')).sell()],
  ])('%s 액션이 RULES.md 치명 규칙을 프롬프트에 상속', async (_name, run) => {
    await run()
    expect(emitted).toHaveLength(1)
    expect(emitted[0]).toContain('테스트 치명 규칙 X')
    expect(emitted[0]).toContain('RULES.md')
  })

  it('RULES.md 없는 프로젝트 → 정직한 안내로 폴백(크래시 0)', async () => {
    mockExistsSync.mockReturnValue(false)
    const { content } = await import('../src/commands/content.js')
    expect(() => content()).not.toThrow()
    expect(emitted[0]).toContain('RULES.md 없음')
  })
})
