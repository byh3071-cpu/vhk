import { describe, it, expect } from 'vitest'
import { routeNaturalLanguage, NLP_KEYWORDS } from '../src/lib/nlp-router.js'

describe('자연어 라우팅', () => {
  it('NLP_KEYWORDS — save·undo·status·diff 키워드 맵', () => {
    expect(NLP_KEYWORDS.save).toContain('저장')
    expect(NLP_KEYWORDS.save).toContain('push')
    expect(NLP_KEYWORDS.undo).toContain('롤백')
    expect(NLP_KEYWORDS.status).toContain('현황')
    expect(NLP_KEYWORDS.diff).toContain('뭐바뀜')
  })

  it('"프로젝트 만들고 싶어" → init', () => {
    const result = routeNaturalLanguage('프로젝트 만들고 싶어')
    expect(result?.command).toBe('init')
  })

  it('"기획 끝났고 바로 시작" → init --skip-gate', () => {
    const result = routeNaturalLanguage('기획 끝났고 바로 시작')
    expect(result?.command).toBe('init')
    expect(result?.args).toContain('--skip-gate')
  })

  it('"오늘 한 일 정리" → recap', () => {
    const result = routeNaturalLanguage('오늘 한 일 정리')
    expect(result?.command).toBe('recap')
  })

  it('"보안 스캔 돌려" → secure', () => {
    const result = routeNaturalLanguage('보안 스캔 돌려')
    expect(result?.command).toBe('secure')
  })

  it('"배포하고 싶어" → ship', () => {
    const result = routeNaturalLanguage('배포하고 싶어')
    expect(result?.command).toBe('ship')
  })

  it('키워드 맵 — save', () => {
    expect(routeNaturalLanguage('세이브해줘')?.command).toBe('save')
    expect(routeNaturalLanguage('푸시 올려')?.command).toBe('save')
  })

  it('키워드 맵 — undo', () => {
    expect(routeNaturalLanguage('롤백해줘')?.command).toBe('undo')
    expect(routeNaturalLanguage('원래대로 돌려')?.command).toBe('undo')
  })

  it('키워드 맵 — status', () => {
    expect(routeNaturalLanguage('지금 어때')?.command).toBe('status')
    expect(routeNaturalLanguage('프로젝트 현황')?.command).toBe('status')
  })

  it('"보안 확인" → secure (status 오라우팅 방지)', () => {
    expect(routeNaturalLanguage('보안 확인')?.command).toBe('secure')
  })

  it('키워드 맵 — diff', () => {
    expect(routeNaturalLanguage('뭐바뀜')?.command).toBe('diff')
    expect(routeNaturalLanguage('수정된 파일')?.command).toBe('diff')
  })

  it('"커밋 취소" → undo (save보다 우선)', () => {
    expect(routeNaturalLanguage('커밋 취소')?.command).toBe('undo')
  })

  it('"asdfqwer" → null (미매칭)', () => {
    const result = routeNaturalLanguage('asdfqwer')
    expect(result).toBeNull()
  })
})
