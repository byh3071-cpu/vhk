export type StackStatus = 'candidate' | 'confirmed'

export const STACK_CANDIDATE_LABEL = '후보, 첫 세션에서 확정'

export function stackStatusLabel(status: StackStatus): string {
  return status === 'candidate' ? STACK_CANDIDATE_LABEL : '확정'
}

export function formatStackStatusNote(status: StackStatus): string {
  return `> 기술 스택 상태: ${stackStatusLabel(status)}`
}

export function inferStackStatus(rulesContent: string): StackStatus {
  return rulesContent.includes(formatStackStatusNote('candidate')) ? 'candidate' : 'confirmed'
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
  const heading = /^## 기술 스택[^\r\n]*(?:\r?\n|$)/m.exec(rulesContent)
  if (!heading) return [rulesContent.trimEnd(), section, ''].join('\n\n')

  const contentStart = heading.index + heading[0].length
  const rest = rulesContent.slice(contentStart)
  const nextHeadingOffset = rest.search(/^## /m)
  const sectionEnd = nextHeadingOffset >= 0 ? contentStart + nextHeadingOffset : rulesContent.length
  const before = rulesContent.slice(0, heading.index).trimEnd()
  const after = rulesContent.slice(sectionEnd).trimStart()
  return [before, section, after].filter(Boolean).join('\n\n') + '\n'
}
