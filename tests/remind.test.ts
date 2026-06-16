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

// 순수함수 직접 검증 — mock fs 우회. 리뷰 확정(엣지 미검증) 보강 + 현 동작 핀(pin).
describe('remind 순수함수 — compressRule / extractCriticalRules (goal 68)', () => {
  it('compressRule: 단일 후행 괄호주석 제거', async () => {
    const { compressRule } = await import('../src/commands/remind.js')
    expect(compressRule('- publish 는 main 에서만 (가드 #119)')).toBe('publish 는 main 에서만')
  })

  it('compressRule: 중첩 괄호로 끝나면 보존(원문 유지 — 안전한 fail-open) [동작 핀]', async () => {
    const { compressRule } = await import('../src/commands/remind.js')
    // [^)]* 가 안쪽 ) 에서 멈춰 $ 앵커 불일치 → 후행 통째 보존. 실 RULES.md 엔 중첩괄호 규칙 없음.
    expect(compressRule('- 토큰 노출 금지 (예: key (sk-...) 평문)')).toBe('토큰 노출 금지 (예: key (sk-...) 평문)')
  })

  it('extractCriticalRules: CRLF 입력에서도 \\r 잔존 없이 추출', async () => {
    const { extractCriticalRules } = await import('../src/commands/remind.js')
    const out = extractCriticalRules('# t\r\n\r\n## Forbidden\r\n\r\n- 규칙A\r\n- 규칙B\r\n')
    expect(out).toEqual(['규칙A', '규칙B'])
  })

  it('extractCriticalRules: 여러 치명섹션(Forbidden+절대규칙+전역금지) 동시 추출', async () => {
    const { extractCriticalRules } = await import('../src/commands/remind.js')
    const md = '# t\n\n## Forbidden\n- A\n\n## 절대 규칙\n- B\n\n## 전역 금지\n- C\n'
    expect(extractCriticalRules(md)).toEqual(['A', 'B', 'C'])
  })

  it('extractCriticalRules: 치명섹션 내 레벨3(###) 하위 불릿도 흡수됨 [동작 핀 — parseRulesMd 가 ## 만 분할]', async () => {
    const { extractCriticalRules } = await import('../src/commands/remind.js')
    // 향후 의도 변경 시 이 핀이 깨져 결정을 강제한다(현재는 흡수 = 과다포함 가능성 인지).
    const md = '# t\n\n## Forbidden\n- A\n\n### 하위메모\n- B\n\n## 코딩 규칙\n- 비치명\n'
    expect(extractCriticalRules(md)).toEqual(['A', 'B'])
  })
})
