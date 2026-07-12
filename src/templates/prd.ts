import type { PrdContent, ScreenItem, V1InItem } from '../types/prd.js'

// RFC 0060 T1: 채울 자리를 개발자 은어(**FILL**)가 아니라 계약서식 관행 마커로 노출.
// 사용자·AI 모두 "여기 뭘 적어야 하나"를 질문 그대로 읽을 수 있고, AI 는 상단 가드에 따라
// 추측으로 채우지 않고 대화로 얻은 답만 넣는다.
const ask = (question: string): string => `[여기에 작성: ${question}]`

// 문서 상단 가드 — [여기에 작성] 칸은 사용자와 대화로만 채운다는 계약.
const FILL_GUARD =
  '> ⚠️ [여기에 작성: …] 칸은 사용자와 대화로 채웁니다 — AI가 추측으로 채우지 않기.'

function fill(value: string | undefined, question: string): string {
  return value?.trim() || ask(question)
}

function v1InRows(items?: V1InItem[]): string[] {
  const defaults: V1InItem[] = [
    { feature: ask('핵심 기능 하나 (꼭 필관리자 것)'), description: '', priority: 'P0' },
    { feature: ask('핵심 기능 하나 더'), description: '', priority: 'P0' },
    { feature: ask('있으면 좋은 기능 (나중에 가능)'), description: '', priority: 'P1' },
  ]
  const rows = items?.length ? items : defaults

  return rows.map((item, i) =>
    `| ${i + 1} | ${item.feature?.trim() || ask('기능 이름')} | ${item.description ?? ''} | ${item.priority || 'P0'} |`
  )
}

function bulletList(items: string[] | undefined, question: string): string[] {
  if (!items?.length) return [`- ${ask(question)}`]
  return items.map(item => `- ${item}`)
}

function screenRows(items?: ScreenItem[]): string[] {
  if (!items?.length) return [`| ${ask('화면 이름 (예: 홈, 로그인)')} | |`]
  return items.map(item => `| ${item.screen?.trim() || ask('화면 이름')} | ${item.elements ?? ''} |`)
}

export function PRD_TEMPLATE(
  name: string,
  desc: string,
  content: Partial<PrdContent> = {}
): string {
  const tagline = fill(content.tagline ?? desc, '이 제품을 한 문장으로 — 누구를 위해 뭘 해주나')

  return [
    '# PRD — ' + name,
    '',
    FILL_GUARD,
    '',
    '## 한 줄 정의',
    tagline,
    '',
    '## 문제 (Problem)',
    fill(content.problem, '어떤 불편·문제를 푸나 (지금은 어떻게 해결 중인지도)'),
    '',
    '## 해결 (Solution)',
    fill(content.solution, '그 문제를 이 제품이 어떻게 푸나'),
    '',
    '## v1 IN (필수 기능)',
    '| # | 기능 | 설명 | 우선순위 |',
    '|---|------|------|----------|',
    ...v1InRows(content.v1In),
    '',
    '## v1 OUT (명시적 제외)',
    ...bulletList(content.v1Out, 'v1에서 뺄 것 (나중으로 미룰 기능)'),
    '',
    '## 화면 인벤토리',
    '| 화면 | 핵심 요소 |',
    '|------|----------|',
    ...screenRows(content.screens),
    '',
    '## 성공 지표',
    ...bulletList(content.metrics, '성공을 뭘로 판단 — 되도록 숫자 (예: 가입 100명)'),
  ].join('\n')
}
