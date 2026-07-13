import { describe, it, expect } from 'vitest'

// goal 74: vhk content — 제품 한 줄(VISION What) → 블로그/스레드/SEO 메타 초안 생성 프롬프트(.vhk/content-prompt.md)
// 순수함수 buildContentPrompt 직접 검증 — Fable5 프롬프트 위생(good/bad 쌍·수치 하드리밋·발송금지) 회귀 고정.

describe('content — buildContentPrompt 순수함수 (goal 74)', () => {
  it('제품 한 줄(what)이 프롬프트에 들어가고 3종 결과물 지시 포함', async () => {
    const { buildContentPrompt } = await import('../src/commands/content.js')
    const p = buildContentPrompt({ what: '3초에 할 일 추가하는 앱' })
    expect(p).toContain('3초에 할 일 추가하는 앱')
    expect(p).toContain('블로그')
    expect(p).toContain('스레드')
    expect(p).toContain('SEO 메타')
  })

  it('what 미지정 시 graceful 안내(크래시 0, 구조 유지)', async () => {
    const { buildContentPrompt } = await import('../src/commands/content.js')
    const p = buildContentPrompt({})
    expect(p).toContain('VISION')
    expect(p).toContain('블로그')
  })

  it('Fable5 하드리밋 — 사람 승인 전 게시·발송 금지(치명 규칙)', async () => {
    const { buildContentPrompt } = await import('../src/commands/content.js')
    const p = buildContentPrompt({ what: 'x' })
    expect(p).toMatch(/승인 전.*(게시|발송).*(금지|마)/)
  })

  it('Fable5 하드리밋 — 수치 상한(결과물 ≤3 · SEO 글자수)', async () => {
    const { buildContentPrompt } = await import('../src/commands/content.js')
    const p = buildContentPrompt({ what: 'x' })
    expect(p).toMatch(/≤\s*3|3종|3개/)
    expect(p).toMatch(/\d+자/)
  })

  it('Fable5 good/bad 예시쌍(✅/❌) 포함', async () => {
    const { buildContentPrompt } = await import('../src/commands/content.js')
    const p = buildContentPrompt({ what: 'x' })
    expect(p).toContain('✅')
    expect(p).toContain('❌')
  })
})

// #458: 과거 교훈 recall 주입 (누적 지시는 launch/ops — content 는 회고 성격 아님)
describe('content — 과거 교훈 recall 주입 (#458)', () => {
  it('lessons 주입 시 [과거 교훈] 섹션 + bullet 렌더', async () => {
    const { buildContentPrompt } = await import('../src/commands/content.js')
    const p = buildContentPrompt({ what: 'x', lessons: ['(성공) 커뮤니티 글이 유입 1위'] })
    expect(p).toContain('과거 교훈')
    expect(p).toContain('- (성공) 커뮤니티 글이 유입 1위')
  })

  it('lessons 미주입·빈 배열이면 [과거 교훈] 섹션 생략', async () => {
    const { buildContentPrompt } = await import('../src/commands/content.js')
    expect(buildContentPrompt({ what: 'x' })).not.toContain('과거 교훈')
    expect(buildContentPrompt({ what: 'x', lessons: [] })).not.toContain('과거 교훈')
  })

  it('하드리밋 — lessons 4개를 줘도 ≤3개만 렌더(프롬프트 비대 금지)', async () => {
    const { buildContentPrompt } = await import('../src/commands/content.js')
    const p = buildContentPrompt({ what: 'x', lessons: ['a1', 'b2', 'c3', 'd4'] })
    expect(p).toContain('- a1')
    expect(p).toContain('- c3')
    expect(p).not.toContain('- d4')
  })
})
