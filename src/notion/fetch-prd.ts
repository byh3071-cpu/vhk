import type { PrdContent } from '../types/prd.js'
import { importNotionPrd } from '../lib/notion-import.js'
import { extractProjectNameFromTitle } from './parse-blocks.js'

export type NotionPrdResult = {
  projectName: string
  prd: Partial<PrdContent>
}

function sectionsToPrdContent(sections: Record<string, string>): Partial<PrdContent> {
  const prd: Partial<PrdContent> = {}

  for (const [heading, content] of Object.entries(sections)) {
    if (heading.includes('한 줄')) prd.tagline = content
    else if (heading.includes('문제')) prd.problem = content
    else if (heading.includes('해결')) prd.solution = content
    else if (heading.includes('v1 IN')) {
      prd.v1In = content
        .split('\n')
        .map(l => l.replace(/^[-*]\s*/, '').trim())
        .filter(Boolean)
        .map((feature, i) => ({
          feature,
          description: '',
          priority: i < 2 ? 'P0' : 'P1',
        }))
    } else if (heading.includes('v1 OUT')) {
      prd.v1Out = content
        .split('\n')
        .map(l => l.replace(/^[-*]\s*/, '').trim())
        .filter(Boolean)
    } else if (heading.includes('화면')) {
      prd.screens = content
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean)
        .map(line => {
          const [screen, ...rest] = line.split(/\s*[|—]\s*/)
          return { screen: screen?.trim() ?? line, elements: rest.join(' ').trim() }
        })
    } else if (heading.includes('성공')) {
      prd.metrics = content
        .split('\n')
        .map(l => l.replace(/^[-*]\s*/, '').trim())
        .filter(Boolean)
    }
  }

  return prd
}

export async function fetchPrdFromNotion(urlOrId: string): Promise<NotionPrdResult> {
  const { title, sections } = await importNotionPrd(urlOrId)
  const prd = sectionsToPrdContent(sections)

  if (!prd.tagline && sections['## 한 줄 정의']) {
    prd.tagline = sections['## 한 줄 정의']
  }

  return {
    projectName: extractProjectNameFromTitle(title),
    prd,
  }
}
