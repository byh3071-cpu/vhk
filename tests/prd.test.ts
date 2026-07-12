import { describe, it, expect } from 'vitest'
import { PRD_TEMPLATE } from '../src/templates/prd.js'

describe('PRD_TEMPLATE', () => {
  it('화면 인벤토리 섹션을 포함한다', () => {
    const md = PRD_TEMPLATE('MyApp', '할 일 앱', {
      problem: '문제',
      v1In: [{ feature: 'CRUD', description: '생성/수정', priority: 'P0' }],
      screens: [{ screen: '홈', elements: '목록' }],
    })

    expect(md).toContain('## 화면 인벤토리')
    expect(md).toContain('| 홈 | 목록 |')
    expect(md).toContain('| 1 | CRUD | 생성/수정 | P0 |')
    expect(md).toContain('문제')
  })

  // RFC 0060 T1: 죽은 마커(**FILL**)를 관행 마커 [여기에 작성: 질문] 으로.
  describe('RFC 0060 T1 — 채움 마커 [여기에 작성:]', () => {
    it('content 없으면 빈 칸을 [여기에 작성: 질문] 마커로 채운다 (**FILL** 잔재 금지)', () => {
      const md = PRD_TEMPLATE('MyApp', '할 일 앱')
      expect(md).toContain('[여기에 작성:')
      expect(md).not.toContain('**FILL**')
      expect(md).not.toContain('FILL')
    })

    it('문서 상단에 "AI 추측 금지" 가드 한 줄이 있다', () => {
      const md = PRD_TEMPLATE('MyApp', '할 일 앱')
      expect(md).toMatch(/\[여기에 작성:[^\n]*대화로 채웁니다/)
      expect(md).toContain('AI가 추측으로 채우지')
    })

    it('부분 채움 — 준 값은 마커 없이, 안 준 항목만 마커 유지', () => {
      const md = PRD_TEMPLATE('MyApp', '할 일 앱', { problem: '리스트 관리가 번거로움' })
      expect(md).toContain('리스트 관리가 번거로움')
      // problem 은 채워졌으니 그 값 주변엔 마커가 아니라 실제 값
      const problemBlock = md.split('## 문제 (Problem)')[1].split('##')[0]
      expect(problemBlock).toContain('리스트 관리가 번거로움')
      expect(problemBlock).not.toContain('[여기에 작성:')
      // solution 은 안 줬으니 마커 유지
      const solutionBlock = md.split('## 해결 (Solution)')[1].split('##')[0]
      expect(solutionBlock).toContain('[여기에 작성:')
    })
  })
})
