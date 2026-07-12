import { describe, it, expect } from 'vitest'
import { ARCHITECTURE_TEMPLATE } from '../src/templates/architecture.js'

describe('ARCHITECTURE_TEMPLATE', () => {
  it('기술 스택을 인자 그대로 반영한다', () => {
    const md = ARCHITECTURE_TEMPLATE('MyApp', 'Next.js + Supabase')
    expect(md).toContain('## 기술 스택')
    expect(md).toContain('Next.js + Supabase')
  })

  // RFC 0060 T1: 죽은 마커(**FILL**)를 관행 마커 [여기에 작성: 질문] 으로.
  describe('RFC 0060 T1 — 채움 마커 [여기에 작성:]', () => {
    it('빈 칸을 [여기에 작성: 질문] 마커로 채운다 (**FILL** 잔재 금지)', () => {
      const md = ARCHITECTURE_TEMPLATE('MyApp', 'Next.js')
      expect(md).toContain('[여기에 작성:')
      expect(md).not.toContain('**FILL**')
      expect(md).not.toContain('FILL')
    })

    it('문서 상단에 "AI 추측 금지" 가드 한 줄이 있다', () => {
      const md = ARCHITECTURE_TEMPLATE('MyApp', 'Next.js')
      expect(md).toMatch(/\[여기에 작성:[^\n]*대화로 채웁니다/)
      expect(md).toContain('AI가 추측으로 채우지')
    })
  })
})
