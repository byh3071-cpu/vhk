import { describe, it, expect, vi, beforeEach } from 'vitest'

// #456: 뒷단(content/launch/sell/ops) 산출물 프롬프트가 RULES.md 치명 규칙을 상속.
// remind 의 추출기(extractCriticalRules)를 lib 로 이동해 단일 SoT — 복붙 0 = 드리프트 구조적 불가.
const mockExistsSync = vi.fn()
const mockReadFileSync = vi.fn()

vi.mock('node:fs', () => ({
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
}))

const RULES_MD =
  '# t\n\n' +
  '## VHK 운영 — Forbidden (전역 금지)\n\n' +
  '> 주석은 제외.\n' +
  '- publish 는 main 에서만 + 사람 승인 (가드 #119)\n' +
  '- `execSync` 신규 사용 금지 → `safeExecFile`\n\n' +
  '## 코딩 규칙\n\n' +
  '- 비치명 일반 규칙\n'

describe('rules-inherit — extractCriticalRules (remind 에서 이동, 동작 보존)', () => {
  it('치명 섹션(Forbidden/절대 규칙) 불릿만 추출, 주석·비치명 섹션 제외', async () => {
    const { extractCriticalRules } = await import('../src/lib/rules-inherit.js')
    const out = extractCriticalRules(RULES_MD)
    expect(out).toEqual(['publish 는 main 에서만 + 사람 승인', '`execSync` 신규 사용 금지 → `safeExecFile`'])
  })

  it('CRLF 입력에서도 \\r 잔존 없이 추출', async () => {
    const { extractCriticalRules } = await import('../src/lib/rules-inherit.js')
    const out = extractCriticalRules('# t\r\n\r\n## Forbidden\r\n\r\n- 규칙A\r\n- 규칙B\r\n')
    expect(out).toEqual(['규칙A', '규칙B'])
  })

  it('여러 치명섹션(Forbidden+절대규칙+전역금지) 동시 추출', async () => {
    const { extractCriticalRules } = await import('../src/lib/rules-inherit.js')
    const md = '# t\n\n## Forbidden\n- A\n\n## 절대 규칙\n- B\n\n## 전역 금지\n- C\n'
    expect(extractCriticalRules(md)).toEqual(['A', 'B', 'C'])
  })
})

describe('rules-inherit — buildRulesInheritLines (프롬프트 블록 포매터, 순수)', () => {
  it('규칙 배열 → 상속 블록(헤더 + 불릿), RULES.md 출처 명시', async () => {
    const { buildRulesInheritLines } = await import('../src/lib/rules-inherit.js')
    const lines = buildRulesInheritLines(['A 금지', 'B 는 사람 승인'])
    const block = lines.join('\n')
    expect(block).toContain('RULES.md')
    expect(block).toContain('- A 금지')
    expect(block).toContain('- B 는 사람 승인')
  })

  it('하드리밋 — 규칙 수 상한(MAX_INHERIT_RULES) 초과분은 잘리고 "외 N개" 정직 안내', async () => {
    const { buildRulesInheritLines, MAX_INHERIT_RULES } = await import('../src/lib/rules-inherit.js')
    const many = Array.from({ length: MAX_INHERIT_RULES + 3 }, (_, i) => `규칙${i + 1}`)
    const lines = buildRulesInheritLines(many)
    const block = lines.join('\n')
    expect(block).toContain(`규칙${MAX_INHERIT_RULES}`)
    expect(block).not.toContain(`- 규칙${MAX_INHERIT_RULES + 1}`)
    expect(block).toContain('외 3개')
  })

  it('하드리밋 — 규칙당 길이 상한(MAX_RULE_LEN) 초과 시 말줄임', async () => {
    const { buildRulesInheritLines, MAX_RULE_LEN } = await import('../src/lib/rules-inherit.js')
    const long = 'x'.repeat(MAX_RULE_LEN + 50)
    const block = buildRulesInheritLines([long]).join('\n')
    expect(block).not.toContain(long)
    expect(block).toContain('x'.repeat(MAX_RULE_LEN) + '…')
  })

  it('undefined(RULES.md 없음/읽기 실패) → 정직한 안내 1줄, 크래시 0', async () => {
    const { buildRulesInheritLines } = await import('../src/lib/rules-inherit.js')
    const block = buildRulesInheritLines(undefined).join('\n')
    expect(block).toContain('RULES.md 없음')
    expect(block).toContain('상속 생략')
  })

  it('빈 배열(치명 섹션 없음) → 정직한 안내 1줄', async () => {
    const { buildRulesInheritLines } = await import('../src/lib/rules-inherit.js')
    const block = buildRulesInheritLines([]).join('\n')
    expect(block).toContain('치명 규칙 섹션 없음')
  })
})

describe('rules-inherit — readCriticalRules (fs 래퍼)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('RULES.md 존재 → 치명 규칙 배열 반환', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(RULES_MD)
    const { readCriticalRules } = await import('../src/lib/rules-inherit.js')
    expect(readCriticalRules()).toEqual([
      'publish 는 main 에서만 + 사람 승인',
      '`execSync` 신규 사용 금지 → `safeExecFile`',
    ])
  })

  it('RULES.md 없음 → undefined (정직 폴백 신호)', async () => {
    mockExistsSync.mockReturnValue(false)
    const { readCriticalRules } = await import('../src/lib/rules-inherit.js')
    expect(readCriticalRules()).toBeUndefined()
  })

  it('읽기 실패(throw) → undefined, 크래시 0', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockImplementation(() => {
      throw new Error('EACCES')
    })
    const { readCriticalRules } = await import('../src/lib/rules-inherit.js')
    expect(() => readCriticalRules()).not.toThrow()
    expect(readCriticalRules()).toBeUndefined()
  })

  it('치명 섹션 없는 RULES.md → 빈 배열([])', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('# t\n\n## 코딩 규칙\n- 일반\n')
    const { readCriticalRules } = await import('../src/lib/rules-inherit.js')
    expect(readCriticalRules()).toEqual([])
  })
})
