import { Client } from '@notionhq/client'
import type { BlockObjectResponse, PageObjectResponse } from '@notionhq/client/build/src/api-endpoints.js'
import type { PrdContent } from '../types/prd.js'
import { extractPageId } from './extract-page-id.js'
import { extractProjectNameFromTitle, parseBlocksToPrd } from './parse-blocks.js'

type Block = BlockObjectResponse

function getPageTitle(page: PageObjectResponse): string {
  const props = page.properties
  for (const prop of Object.values(props)) {
    if (prop.type === 'title') {
      return prop.title.map(t => t.plain_text).join('')
    }
  }
  return 'Untitled'
}

async function fetchAllBlocks(client: Client, blockId: string): Promise<Block[]> {
  const blocks: Block[] = []
  let cursor: string | undefined

  do {
    const response = await client.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    })

    for (const block of response.results) {
      if (!('type' in block)) continue
      blocks.push(block as Block)

      if (block.has_children && block.type !== 'child_page' && block.type !== 'child_database') {
        const children = await fetchAllBlocks(client, block.id)
        blocks.push(...children)
      }
    }

    cursor = response.has_more ? response.next_cursor ?? undefined : undefined
  } while (cursor)

  return blocks
}

export type NotionPrdResult = {
  projectName: string
  prd: Partial<PrdContent>
}

export async function fetchPrdFromNotion(urlOrId: string): Promise<NotionPrdResult> {
  const token = process.env.NOTION_TOKEN
  if (!token) {
    throw new Error(
      'NOTION_TOKEN 환경변수가 필요합니다.\n' +
      '  1. https://www.notion.so/my-integrations 에서 Integration 생성\n' +
      '  2. PRD 페이지에 Integration 연결\n' +
      '  3. $env:NOTION_TOKEN = "secret_xxx" 설정'
    )
  }

  const pageId = extractPageId(urlOrId)
  const client = new Client({ auth: token })

  const page = await client.pages.retrieve({ page_id: pageId }) as PageObjectResponse
  const title = getPageTitle(page)
  const blocks = await fetchAllBlocks(client, pageId)
  const prd = parseBlocksToPrd(blocks)

  if (!prd.tagline) {
    const firstParagraph = blocks.find(b => b.type === 'paragraph')
    if (firstParagraph && 'paragraph' in firstParagraph) {
      const text = firstParagraph.paragraph.rich_text.map(t => t.plain_text).join('')
      if (text) prd.tagline = text
    }
  }

  return {
    projectName: extractProjectNameFromTitle(title),
    prd,
  }
}
