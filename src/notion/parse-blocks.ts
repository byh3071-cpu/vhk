import type { PrdContent, ScreenItem, V1InItem } from '../types/prd.js'

type RichText = { plain_text: string }
type Block = {
  id: string
  type: string
  has_children?: boolean
  [key: string]: unknown
}

function richText(block: Block): string {
  const data = block[block.type] as { rich_text?: RichText[] } | undefined
  return data?.rich_text?.map(t => t.plain_text).join('') ?? ''
}

function normalizeHeading(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

function matchSection(heading: string): keyof PrdContent | null {
  const h = normalizeHeading(heading)
  if (h.includes('한 줄') || h.includes('tagline') || h.includes('one-liner')) return 'tagline'
  if (h.includes('문제') || h.includes('problem')) return 'problem'
  if (h.includes('해결') || h.includes('solution')) return 'solution'
  if (h.includes('v1 in') || h.includes('필수 기능') || h.includes('in (')) return 'v1In'
  if (h.includes('v1 out') || h.includes('제외') || h.includes('out (')) return 'v1Out'
  if (h.includes('화면') || h.includes('screen')) return 'screens'
  if (h.includes('성공') || h.includes('metric') || h.includes('kpi')) return 'metrics'
  return null
}

function parseTableRows(rows: Block[][]): string[][] {
  return rows.map(row =>
    row.map(cell => richText(cell))
  )
}

function tableToV1In(rows: string[][]): V1InItem[] {
  if (rows.length < 2) {
    return rows.map((row, i) => ({
      feature: row[1] ?? row[0] ?? '',
      description: row[2] ?? '',
      priority: row[3] ?? (i < 2 ? 'P0' : 'P1'),
    }))
  }

  const [header, ...body] = rows
  const featureIdx = header.findIndex(h => /기능|feature/i.test(h))
  const descIdx = header.findIndex(h => /설명|desc/i.test(h))
  const prioIdx = header.findIndex(h => /우선|priority|prio/i.test(h))

  return body.map((row, i) => ({
    feature: row[featureIdx >= 0 ? featureIdx : 1] ?? row[0] ?? '',
    description: row[descIdx >= 0 ? descIdx : 2] ?? '',
    priority: row[prioIdx >= 0 ? prioIdx : 3] ?? (i < 2 ? 'P0' : 'P1'),
  })).filter(item => item.feature.trim())
}

function tableToScreens(rows: string[][]): ScreenItem[] {
  if (rows.length < 2) {
    return rows.map(row => ({ screen: row[0] ?? '', elements: row[1] ?? '' }))
  }

  const [header, ...body] = rows
  const screenIdx = header.findIndex(h => /화면|screen|page/i.test(h))
  const elemIdx = header.findIndex(h => /요소|element|핵심/i.test(h))

  return body.map(row => ({
    screen: row[screenIdx >= 0 ? screenIdx : 0] ?? '',
    elements: row[elemIdx >= 0 ? elemIdx : 1] ?? '',
  })).filter(item => item.screen.trim())
}

export function parseBlocksToPrd(blocks: Block[]): Partial<PrdContent> {
  const result: Partial<PrdContent> = {}
  let currentSection: keyof PrdContent | null = null
  let paragraphBuffer: string[] = []
  let bulletBuffer: string[] = []
  let tableBuffer: Block[][] = []
  let inTable = false

  const flushParagraph = () => {
    if (!currentSection || !paragraphBuffer.length) return
    const text = paragraphBuffer.join('\n').trim()
    if (!text) return

    if (currentSection === 'tagline' || currentSection === 'problem' || currentSection === 'solution') {
      result[currentSection] = text
    }
    paragraphBuffer = []
  }

  const flushBullets = () => {
    if (!currentSection || !bulletBuffer.length) return

    if (currentSection === 'v1Out' || currentSection === 'metrics') {
      result[currentSection] = [...bulletBuffer]
    } else if (currentSection === 'v1In') {
      result.v1In = bulletBuffer.map((feature, i) => ({
        feature,
        description: '',
        priority: i < 2 ? 'P0' : 'P1',
      }))
    } else if (currentSection === 'screens') {
      result.screens = bulletBuffer.map(line => {
        const [screen, ...rest] = line.split('—')
        return { screen: screen?.trim() ?? line, elements: rest.join('—').trim() }
      })
    }
    bulletBuffer = []
  }

  const flushTable = () => {
    if (!currentSection || !tableBuffer.length) return
    const rows = parseTableRows(tableBuffer)

    if (currentSection === 'v1In') result.v1In = tableToV1In(rows)
    if (currentSection === 'screens') result.screens = tableToScreens(rows)

    tableBuffer = []
    inTable = false
  }

  const switchSection = (section: keyof PrdContent | null) => {
    flushParagraph()
    flushBullets()
    flushTable()
    currentSection = section
  }

  for (const block of blocks) {
    if (block.type === 'heading_1' || block.type === 'heading_2' || block.type === 'heading_3') {
      switchSection(matchSection(richText(block)))
      continue
    }

    if (block.type === 'table') {
      inTable = true
      continue
    }

    if (block.type === 'table_row') {
      const cells = (block.table_row as { cells?: RichText[][] })?.cells ?? []
      tableBuffer.push(cells.map(cell => ({
        id: block.id,
        type: 'paragraph',
        paragraph: { rich_text: cell },
      })))
      continue
    }

    if (inTable && block.type !== 'table_row') {
      flushTable()
    }

    if (block.type === 'paragraph') {
      const text = richText(block)
      if (text) paragraphBuffer.push(text)
      continue
    }

    if (block.type === 'bulleted_list_item' || block.type === 'numbered_list_item') {
      const text = richText(block)
      if (text) bulletBuffer.push(text)
    }
  }

  flushParagraph()
  flushBullets()
  flushTable()

  return result
}

export function extractProjectNameFromTitle(title: string): string {
  return title.replace(/^PRD\s*[—\-–|:]\s*/i, '').trim() || title
}
