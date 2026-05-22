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
})
