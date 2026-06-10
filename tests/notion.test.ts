import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { extractPageId, importNotionPrd } from '../src/lib/notion-import.js'
import { parseBlocksToPrd, extractProjectNameFromTitle } from '../src/notion/parse-blocks.js'
import { PRD_TEMPLATE } from '../src/templates/prd.js'

// Goal 52: Notion 실 API 경로(importNotionPrd) — @notionhq/client 를 mock 으로 봉쇄.
// 순수함수(extractPageId/parseBlocks…)는 Client 미사용이라 같은 파일에서 공존 OK.
const notionMock = vi.hoisted(() => ({
  retrieve: vi.fn(),
  list: vi.fn(),
}))
vi.mock('@notionhq/client', () => ({
  // new Client({auth}) 로 인스턴스화 → 생성자여야 하므로 class 로 mock.
  Client: class {
    pages = { retrieve: notionMock.retrieve }
    blocks = { children: { list: notionMock.list } }
  },
}))

describe('extractPageId', () => {
  it('Notion URL에서 page ID를 추출한다', () => {
    const id = extractPageId('https://notion.so/myworkspace/MyApp-PRD-abc123def4567890abcdef1234567890')
    expect(id).toBe('abc123de-f456-7890-abcd-ef1234567890')
  })

  it('UUID 형식 ID를 그대로 받는다', () => {
    const id = extractPageId('abc123de-f456-7890-abcd-ef1234567890')
    expect(id).toBe('abc123de-f456-7890-abcd-ef1234567890')
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

describe('importNotionPrd (실 API 경로 — vi.mock)', () => {
  const URL = 'https://notion.so/x/Page-abc123def4567890abcdef1234567890'
  const ORIG_TOKEN = process.env.NOTION_TOKEN

  beforeEach(() => {
    notionMock.retrieve.mockReset()
    notionMock.list.mockReset()
    delete process.env.NOTION_TOKEN
  })

  afterEach(() => {
    if (ORIG_TOKEN === undefined) delete process.env.NOTION_TOKEN
    else process.env.NOTION_TOKEN = ORIG_TOKEN
  })

  it('NOTION_TOKEN 누락 → 친절한 에러 throw (auth 가드, :115-123)', async () => {
    await expect(importNotionPrd(URL)).rejects.toThrow(/NOTION_TOKEN/)
    expect(notionMock.retrieve).not.toHaveBeenCalled()
  })

  it('fetchAllBlocks has_more 페이지네이션 누적 (:50-75)', async () => {
    process.env.NOTION_TOKEN = 'secret_test'
    notionMock.retrieve.mockResolvedValue({
      properties: { Name: { type: 'title', title: [{ plain_text: '내 PRD' }] } },
    })
    notionMock.list
      .mockResolvedValueOnce({
        results: [
          { id: 'b1', type: 'heading_2', has_children: false, heading_2: { rich_text: [{ plain_text: '문제' }] } },
          { id: 'b2', type: 'paragraph', has_children: false, paragraph: { rich_text: [{ plain_text: '첫 페이지' }] } },
        ],
        has_more: true,
        next_cursor: 'cursor-2',
      })
      .mockResolvedValueOnce({
        results: [
          { id: 'b3', type: 'paragraph', has_children: false, paragraph: { rich_text: [{ plain_text: '둘째 페이지' }] } },
        ],
        has_more: false,
        next_cursor: null,
      })

    const prd = await importNotionPrd(URL)

    expect(prd.title).toBe('내 PRD')
    expect(notionMock.list).toHaveBeenCalledTimes(2) // has_more true → 2회 페이지 조회
    // 두 페이지의 블록이 모두 누적돼 같은 섹션에 합쳐짐
    expect(prd.sections['## 문제 (Problem)']).toContain('첫 페이지')
    expect(prd.sections['## 문제 (Problem)']).toContain('둘째 페이지')
  })

  it('pages.retrieve reject → 에러 그대로 전파 (:128)', async () => {
    process.env.NOTION_TOKEN = 'secret_test'
    notionMock.retrieve.mockRejectedValue(new Error('notion 404 not found'))
    await expect(importNotionPrd(URL)).rejects.toThrow(/notion 404/)
    expect(notionMock.list).not.toHaveBeenCalled() // retrieve 실패 시 블록 조회 미진입
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
