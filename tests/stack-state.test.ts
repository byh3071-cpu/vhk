import { describe, expect, it } from 'vitest'
import {
  formatStackStatusNote,
  inferStackStatus,
  STACK_CANDIDATE_LABEL,
  stackStatusLabel,
  upsertRulesStackSection,
} from '../src/lib/stack-state.js'

describe('기술 스택 상태 단일 소스', () => {
  it('후보와 확정 용어를 한 형식으로 만든다', () => {
    expect(stackStatusLabel('candidate')).toBe(STACK_CANDIDATE_LABEL)
    expect(stackStatusLabel('confirmed')).toBe('확정')
    expect(formatStackStatusNote('candidate')).toBe(`> 기술 스택 상태: ${STACK_CANDIDATE_LABEL}`)
  })

  it('RULES.md 후보 표시는 후보로, 표시가 없으면 기존 호환을 위해 확정으로 읽는다', () => {
    expect(inferStackStatus(`# Rules\n\n${formatStackStatusNote('candidate')}\n`)).toBe('candidate')
    expect(inferStackStatus('# Rules\n\n## 기술 스택\n- Node.js\n')).toBe('confirmed')
  })

  it('adopt된 RULES의 기존 기술 스택 섹션을 중복 없이 선택 상태로 교체한다', () => {
    const input = '# P — Rules\n\n## 기술 스택 (기존)\n- Next.js\n\n## 코딩 규칙\n- strict\n'
    const output = upsertRulesStackSection(input, ['Vite', 'React'], 'candidate')
    expect(output.match(/^## 기술 스택/gm)).toHaveLength(1)
    expect(output).toContain(STACK_CANDIDATE_LABEL)
    expect(output).toContain('- Vite')
    expect(output).not.toContain('Next.js')
    expect(output).toContain('## 코딩 규칙')
    expect(output).toContain('- strict')
  })

  it('기술 스택 섹션이 없는 adopt 규칙에는 새 섹션을 추가한다', () => {
    const output = upsertRulesStackSection('# P — Rules\n\n## 코딩 규칙\n- strict\n', ['Rust'], 'confirmed')
    expect(output).toContain('## 기술 스택')
    expect(output).toContain('기술 스택 상태: 확정')
    expect(output).toContain('- Rust')
  })
})
