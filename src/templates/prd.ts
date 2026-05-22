import type { PrdContent, ScreenItem, V1InItem } from '../types/prd.js'

const FILL = '__FILL__'

function fill(value: string | undefined, fallback = FILL): string {
  return value?.trim() || fallback
}

function v1InRows(items?: V1InItem[]): string[] {
  const defaults: V1InItem[] = [
    { feature: FILL, description: '', priority: 'P0' },
    { feature: FILL, description: '', priority: 'P0' },
    { feature: FILL, description: '', priority: 'P1' },
  ]
  const rows = items?.length ? items : defaults

  return rows.map((item, i) =>
    `| ${i + 1} | ${fill(item.feature)} | ${item.description ?? ''} | ${item.priority || 'P0'} |`
  )
}

function bulletList(items?: string[], fallback = FILL): string[] {
  if (!items?.length) return [`- ${fallback}`]
  return items.map(item => `- ${item}`)
}

function screenRows(items?: ScreenItem[]): string[] {
  if (!items?.length) return [`| ${FILL} | |`]
  return items.map(item => `| ${fill(item.screen)} | ${item.elements ?? ''} |`)
}

export function PRD_TEMPLATE(
  name: string,
  desc: string,
  content: Partial<PrdContent> = {}
): string {
  const tagline = fill(content.tagline ?? desc)

  return [
    '# PRD — ' + name,
    '',
    '## 한 줄 정의',
    tagline,
    '',
    '## 문제 (Problem)',
    fill(content.problem),
    '',
    '## 해결 (Solution)',
    fill(content.solution),
    '',
    '## v1 IN (필수 기능)',
    '| # | 기능 | 설명 | 우선순위 |',
    '|---|------|------|----------|',
    ...v1InRows(content.v1In),
    '',
    '## v1 OUT (명시적 제외)',
    ...bulletList(content.v1Out),
    '',
    '## 화면 인벤토리',
    '| 화면 | 핵심 요소 |',
    '|------|----------|',
    ...screenRows(content.screens),
    '',
    '## 성공 지표',
    ...bulletList(content.metrics),
  ].join('\n')
}
