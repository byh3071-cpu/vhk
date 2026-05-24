import { describe, it, expect } from 'vitest'
import { routeNaturalLanguage } from '../src/lib/nlp-router.js'

describe('vhk start — NLP 라우팅', () => {
  it("'시작' 한 단어 입력은 start로 라우팅된다", () => {
    const route = routeNaturalLanguage('시작')
    expect(route?.command).toBe('start')
  })

  it("'새 프로젝트 시작해줘'는 start로 라우팅된다", () => {
    const route = routeNaturalLanguage('새 프로젝트 시작해줘')
    expect(route?.command).toBe('start')
  })

  it("'프로젝트 만들고 싶어'는 start로 라우팅된다", () => {
    const route = routeNaturalLanguage('프로젝트 만들고 싶어')
    expect(route?.command).toBe('start')
  })

  it("'마법사'는 start로 라우팅된다", () => {
    const route = routeNaturalLanguage('마법사')
    expect(route?.command).toBe('start')
  })

  it("'기획 끝났어요 바로 시작'은 start로 라우팅된다", () => {
    const route = routeNaturalLanguage('기획 끝났어요 바로 시작')
    expect(route?.command).toBe('start')
  })

  it("'노션에서 가져와서 시작'은 start --from-notion으로 라우팅된다", () => {
    const route = routeNaturalLanguage('노션에서 가져와서 시작')
    expect(route?.command).toBe('start')
    expect(route?.args).toContain('--from-notion')
  })

  it("'초기화'는 init으로 라우팅된다 (start 아님)", () => {
    const route = routeNaturalLanguage('초기화')
    expect(route?.command).toBe('init')
  })

  it("'init만'은 init으로 라우팅된다", () => {
    const route = routeNaturalLanguage('init만')
    expect(route?.command).toBe('init')
  })

  it("디자인 관련 키워드와 함께 '시작'은 start로 가지 않는다", () => {
    const route = routeNaturalLanguage('디자인 토큰 만들기 시작')
    expect(route?.command).not.toBe('start')
  })

  it("컨텍스트 관련 키워드와 함께 '만들'은 start로 가지 않는다", () => {
    const route = routeNaturalLanguage('컨텍스트 만들어줘')
    expect(route?.command).toBe('context')
  })
})

describe('vhk start — 모듈 구조', () => {
  it('start 함수가 export된다', async () => {
    const mod = await import('../src/commands/start.js')
    expect(typeof mod.start).toBe('function')
  })

  it('StartOptions 타입의 필드를 모두 받는다 (컴파일 시간 검증)', async () => {
    const mod = await import('../src/commands/start.js')
    // 런타임에서는 함수 존재만 확인. 타입은 tsc가 검증.
    expect(mod.start.length).toBeLessThanOrEqual(1)
  })
})
