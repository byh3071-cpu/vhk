import { describe, it, expect, vi, beforeEach } from 'vitest'

// goal 68: vhk remind — RULES.md 치명 규칙(NON-NEGOTIABLE/절대규칙/Forbidden) 추출 → .vhk/remind.md
const mockExistsSync = vi.fn()
const mockReadFileSync = vi.fn()
const mockWriteFileSync = vi.fn()
const mockMkdirSync = vi.fn()

vi.mock('node:fs', () => ({
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
  writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
  mkdirSync: (...a: unknown[]) => mockMkdirSync(...a),
}))

function writtenMd(): string {
  const call = mockWriteFileSync.mock.calls.find((c) => String(c[0]).includes('remind.md'))
  return call ? String(call[1]) : ''
}

const RULES_WITH_FORBIDDEN =
  '# vhk\n\n' +
  '## VHK 운영 — Forbidden (전역 금지)\n\n' +
  '> 단일 Forbidden 목록 — 주석은 제외되어야 한다.\n' +
  '- publish 는 main 에서만 + 사람 승인 (가드 #119)\n' +
  '- execSync 신규 사용 금지\n\n' +
  '## 코딩 규칙\n\n' +
  '- 비-치명 일반 규칙\n'

describe('remind (goal 68)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('RULES.md Forbidden 섹션의 불릿만 치명 규칙으로 추출(주석·비치명 섹션 제외)', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(RULES_WITH_FORBIDDEN)
    const { remind } = await import('../src/commands/remind.js')
    remind()
    const md = writtenMd()
    // 후행 괄호주석(가드 #119) 제거된 핵심만
    expect(md).toContain('치명: publish 는 main 에서만 + 사람 승인')
    expect(md).not.toContain('가드 #119')
    expect(md).toContain('치명: execSync 신규 사용 금지')
    // '>' 주석 줄 제외
    expect(md).not.toContain('단일 Forbidden 목록')
    // 비-치명 섹션(코딩 규칙)은 제외
    expect(md).not.toContain('비-치명 일반 규칙')
  })

  it('## 절대 규칙 헤더도 추출(카드 스펙 NON-NEGOTIABLE/절대규칙)', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('# t\n\n## 절대 규칙\n\n- 토큰 평문 노출 금지\n')
    const { remind } = await import('../src/commands/remind.js')
    remind()
    expect(writtenMd()).toContain('치명: 토큰 평문 노출 금지')
  })

  it('RULES.md 없으면 graceful — 크래시 0 + 안내 문구', async () => {
    mockExistsSync.mockReturnValue(false)
    const { remind } = await import('../src/commands/remind.js')
    expect(() => remind()).not.toThrow()
    expect(writtenMd()).toContain('RULES.md 없음')
  })

  it('치명 섹션이 없으면 빈 안내(크래시 0)', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('# t\n\n## 코딩 규칙\n\n- 일반 규칙\n')
    const { remind } = await import('../src/commands/remind.js')
    remind()
    expect(writtenMd()).toContain('치명 규칙 섹션 없음')
  })
})
