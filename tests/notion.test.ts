import { describe, it, expect } from 'vitest'
import { extractPageId } from '../src/notion/extract-page-id.js'
import { parseBlocksToPrd, extractProjectNameFromTitle } from '../src/notion/parse-blocks.js'
import { PRD_TEMPLATE } from '../src/templates/prd.js'

describe('extractPageId', () => {
  it('Notion URL에서 page ID를 추출한다', () => {
    const id = extractPageId('https://notion.so/myworkspace/MyApp-PRD-00000000-0000-0000-0000-000000000000')
    expect(id).toBe('00000000-0000-0000-0000-000000000000')
  })

  it('UUID 형식 ID를 그대로 받는다', () => {
    const id = extractPageId('00000000-0000-0000-0000-000000000000')
    expect(id).toBe('00000000-0000-0000-0000-000000000000')
  })
})

describe('parseBlocksToPrd', () => {
  it('heading 섹션을 PRD 필드로 매핑한다', () => {
    const blocks = [
      { id: '1', type: 'heading_2', heading_2: { rich_text: [{ plain_text: '문제 (Problem)' }] } },
      { id: '2', type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Slack 이중 입력' }] } },
      { id: '3', type: 'heading_2', heading_2: { rich_text: [{ plain_text: 'v1 IN (필수 기능)' }] } },
      { id: '4', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ plain_text: '태스크 CRUD' }] } },
      { id: '5', type: 'heading_2', heading_2: { rich_text: [{ plain_text: '화면 인벤토리' }] } },
      { id: '6', type: 'table_row', table_row: { cells: [[{ plain_text: '대시보드' }], [{ plain_text: '태스크 목록' }]] } },
    ]

    const prd = parseBlocksToPrd(blocks)
    expect(prd.problem).toBe('Slack 이중 입력')
    expect(prd.v1In?.[0]?.feature).toBe('태스크 CRUD')
    expect(prd.screens?.[0]?.screen).toBe('대시보드')
  })
})

describe('extractProjectNameFromTitle', () => {
  it('PRD 접두사를 제거한다', () => {
    expect(extractProjectNameFromTitle('PRD — MyApp')).toBe('MyApp')
  })
})

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
