import { Client } from '@notionhq/client'
import type { BlockObjectResponse, PageObjectResponse } from '@notionhq/client/build/src/api-endpoints.js'

export interface PrdData {
  title: string
  sections: Record<string, string>
}

const SECTION_MAP: Record<string, string> = {
  '한 줄 정의': '## 한 줄 정의',
  '문제': '## 문제 (Problem)',
  'Problem': '## 문제 (Problem)',
  '해결': '## 해결 (Solution)',
  'Solution': '## 해결 (Solution)',
  'v1 IN': '## v1 IN (필수 기능)',
  '필수 기능': '## v1 IN (필수 기능)',
  'v1 OUT': '## v1 OUT (명시적 제외)',
  '제외': '## v1 OUT (명시적 제외)',
  '화면 인벤토리': '## 화면 인벤토리',
  '성공 지표': '## 성공 지표',
}

type NotionBlock = BlockObjectResponse

export function extractPageId(url: string): string {
  const trimmed = url.trim()
  const uuidMatch = trimmed.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  )
  if (uuidMatch) return uuidMatch[1]!

  const hex32 = trimmed.replace(/-/g, '').match(/([0-9a-f]{32})$/i)
  if (hex32) {
    const id = hex32[1]!
    return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`
  }

  throw new Error('유효한 Notion 페이지 URL이 아닙니다.')
}

function getPageTitle(page: PageObjectResponse): string {
  for (const prop of Object.values(page.properties)) {
    if (prop.type === 'title') {
      return prop.title.map(t => t.plain_text).join('')
    }
  }
  return 'Untitled'
}

async function fetchAllBlocks(client: Client, blockId: string): Promise<NotionBlock[]> {
  const blocks: NotionBlock[] = []
  let cursor: string | undefined

  do {
    const response = await client.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    })

    for (const block of response.results) {
      if (!('type' in block)) continue
      const b = block as NotionBlock
      blocks.push(b)

      if (b.has_children && b.type !== 'child_page' && b.type !== 'child_database') {
        blocks.push(...await fetchAllBlocks(client, b.id))
      }
    }

    cursor = response.has_more ? response.next_cursor ?? undefined : undefined
  } while (cursor)

  return blocks
}

function extractText(block: NotionBlock): string {
  const type = block.type
  const data = block[type] as { rich_text?: Array<{ plain_text: string }> } | undefined
  if (!data?.rich_text) return ''
  return data.rich_text.map(t => t.plain_text).join('')
}

export function parseBlocks(blocks: NotionBlock[]): Record<string, string> {
  const sections: Record<string, string> = {}
  let currentSection = ''
  let currentContent: string[] = []

  for (const block of blocks) {
    if (block.type === 'heading_2' || block.type === 'heading_1') {
      if (currentSection) {
        sections[currentSection] = currentContent.join('\n').trim()
      }
      const text = extractText(block)
      const mapped = Object.entries(SECTION_MAP).find(([k]) => text.includes(k))
      currentSection = mapped ? mapped[1] : `## ${text}`
      currentContent = []
    } else {
      const text = extractText(block)
      if (text) currentContent.push(text)
    }
  }

  if (currentSection) {
    sections[currentSection] = currentContent.join('\n').trim()
  }

  return sections
}

export async function importNotionPrd(pageUrl: string): Promise<PrdData> {
  const token = process.env.NOTION_TOKEN
  if (!token) {
    throw new Error(
      'NOTION_TOKEN 환경변수가 설정되지 않았습니다.\n' +
      '  1. notion.so/my-integrations 에서 Integration 생성\n' +
      '  2. PRD 페이지 → ... → Connections → Integration 연결\n' +
      '  3. $env:NOTION_TOKEN = "secret_xxx" 설정'
    )
  }

  const pageId = extractPageId(pageUrl)
  const notion = new Client({ auth: token })

  const page = await notion.pages.retrieve({ page_id: pageId }) as PageObjectResponse
  const title = getPageTitle(page)
  const blocks = await fetchAllBlocks(notion, pageId)
  const sections = parseBlocks(blocks)

  return { title, sections }
}
