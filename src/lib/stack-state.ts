export type StackStatus = 'candidate' | 'confirmed'

export const STACK_CANDIDATE_LABEL = '후보, 첫 세션에서 확정'

export function stackStatusLabel(status: StackStatus): string {
  return status === 'candidate' ? STACK_CANDIDATE_LABEL : '확정'
}

export function formatStackStatusNote(status: StackStatus): string {
  return `> 기술 스택 상태: ${stackStatusLabel(status)}`
}

type ExactSection = {
  headingStart: number
  sectionEnd: number
  content: string
}

function findExactSection(rulesContent: string, title: string): ExactSection | null {
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const heading = new RegExp(`^## ${escapedTitle}[ \\t]*(?:\\r?\\n|$)`, 'm').exec(rulesContent)
  if (!heading) return null

  const contentStart = heading.index + heading[0].length
  const rest = rulesContent.slice(contentStart)
  const nextHeadingOffset = rest.search(/^## /m)
  const sectionEnd = nextHeadingOffset >= 0 ? contentStart + nextHeadingOffset : rulesContent.length
  return {
    headingStart: heading.index,
    sectionEnd,
    content: rulesContent.slice(contentStart, sectionEnd),
  }
}

export function inferStackStatus(rulesContent: string): StackStatus {
  const section = findExactSection(rulesContent, '기술 스택')
  return section?.content.includes(formatStackStatusNote('candidate')) ? 'candidate' : 'confirmed'
}

export function extractRulesStack(rulesContent: string): string[] {
  const section = findExactSection(rulesContent, '기술 스택')
  if (!section) return []

  return section.content
    .split(/\r?\n/)
    .map((line) => /^-\s+(.+?)\s*$/.exec(line)?.[1] ?? '')
    .filter(Boolean)
}

export function upsertRulesStackSection(
  rulesContent: string,
  stack: readonly string[],
  status: StackStatus,
): string {
  const section = [
    '## 기술 스택',
    formatStackStatusNote(status),
    '',
    ...stack.map((item) => `- ${item}`),
  ].join('\n')
  const existing = findExactSection(rulesContent, '기술 스택')
  if (!existing) {
    let separator = '\n\n'
    if (rulesContent.length === 0 || /\r?\n\r?\n$/.test(rulesContent)) separator = ''
    else if (/\r?\n$/.test(rulesContent)) separator = '\n'
    return `${rulesContent}${separator}${section}\n`
  }

  const before = rulesContent.slice(0, existing.headingStart).trimEnd()
  const after = rulesContent.slice(existing.sectionEnd).trimStart()
  return [before, section, after].filter(Boolean).join('\n\n') + '\n'
}
