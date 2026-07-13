import { describe, it, expect } from 'vitest'

// goal 77: vhk sell — 제품 한 줄(VISION What) → 판매 준비 체크리스트 + 가격 페이지 카피·FAQ 초안 생성 프롬프트(.vhk/sell-prompt.md)
// 순수함수 buildSellPrompt 직접 검증 — Fable5 프롬프트 위생(good/bad 쌍·수치 하드리밋·결제/과금 금지) 회귀 고정.

describe('sell — buildSellPrompt 순수함수 (goal 77)', () => {
  it('제품 한 줄(what)이 프롬프트에 들어가고 판매 체크리스트·가격 페이지·FAQ 지시 포함', async () => {
    const { buildSellPrompt } = await import('../src/commands/sell.js')
    const p = buildSellPrompt({ what: '3초에 할 일 추가하는 앱' })
    expect(p).toContain('3초에 할 일 추가하는 앱')
    expect(p).toContain('체크리스트')
    expect(p).toContain('가격 페이지')
    expect(p).toMatch(/FAQ|자주 묻는/)
  })

  it('what 미지정 시 graceful 안내(크래시 0, 구조 유지)', async () => {
    const { buildSellPrompt } = await import('../src/commands/sell.js')
    const p = buildSellPrompt({})
    expect(p).toContain('VISION')
    expect(p).toContain('체크리스트')
  })

  it('Fable5 하드리밋 — 사람 승인 전 결제·과금 금지(치명 규칙)', async () => {
    const { buildSellPrompt } = await import('../src/commands/sell.js')
    const p = buildSellPrompt({ what: 'x' })
    expect(p).toMatch(/승인 전.*(결제|과금).*(금지|마)/)
  })

  it('Fable5 하드리밋 — 수치 상한(FAQ ≤3개)', async () => {
    const { buildSellPrompt } = await import('../src/commands/sell.js')
    const p = buildSellPrompt({ what: 'x' })
    expect(p).toMatch(/≤\s*3|3종|3개/)
  })

  it('Fable5 good/bad 예시쌍(✅/❌) 포함', async () => {
    const { buildSellPrompt } = await import('../src/commands/sell.js')
    const p = buildSellPrompt({ what: 'x' })
    expect(p).toContain('✅')
    expect(p).toContain('❌')
  })
})

// #458: 과거 교훈 recall 주입 (누적 지시는 launch/ops — sell 은 회고 성격 아님)
describe('sell — 과거 교훈 recall 주입 (#458)', () => {
  it('lessons 주입 시 [과거 교훈] 섹션 + bullet 렌더', async () => {
    const { buildSellPrompt } = await import('../src/commands/sell.js')
    const p = buildSellPrompt({ what: 'x', lessons: ['(결정) 가격은 월 구독으로'] })
    expect(p).toContain('과거 교훈')
    expect(p).toContain('- (결정) 가격은 월 구독으로')
  })

  it('lessons 미주입·빈 배열이면 [과거 교훈] 섹션 생략', async () => {
    const { buildSellPrompt } = await import('../src/commands/sell.js')
    expect(buildSellPrompt({ what: 'x' })).not.toContain('과거 교훈')
    expect(buildSellPrompt({ what: 'x', lessons: [] })).not.toContain('과거 교훈')
  })

  it('하드리밋 — lessons 4개를 줘도 ≤3개만 렌더(프롬프트 비대 금지)', async () => {
    const { buildSellPrompt } = await import('../src/commands/sell.js')
    const p = buildSellPrompt({ what: 'x', lessons: ['a1', 'b2', 'c3', 'd4'] })
    expect(p).toContain('- a1')
    expect(p).toContain('- c3')
    expect(p).not.toContain('- d4')
  })
})

// #456: 산출물이 프로젝트 RULES.md 치명 규칙을 상속 — 하드코딩 복붙 아닌 런타임 주입(드리프트 0).
describe('sell — RULES.md 치명 규칙 상속 (#456)', () => {
  it('rules 주입 시 프롬프트에 규칙 + RULES.md 출처 표기 포함', async () => {
    const { buildSellPrompt } = await import('../src/commands/sell.js')
    const p = buildSellPrompt({ what: 'x', rules: ['토큰/시크릿 코드·커밋 평문 노출 금지'] })
    expect(p).toContain('RULES.md')
    expect(p).toContain('- 토큰/시크릿 코드·커밋 평문 노출 금지')
  })

  it('rules 미주입(RULES.md 없음) → 정직한 안내 + 기존 구조 유지', async () => {
    const { buildSellPrompt } = await import('../src/commands/sell.js')
    const p = buildSellPrompt({ what: 'x' })
    expect(p).toContain('RULES.md 없음')
    expect(p).toContain('FAQ') // 현행 동작 유지
  })
})
