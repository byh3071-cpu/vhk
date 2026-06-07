import { describe, it, expect } from 'vitest'
import { diagIcon, formatDiagnostics } from '../../src/doctor/report.js'
import type { Diagnostic } from '../../src/doctor/types.js'

describe('diagIcon', () => {
  it('상태별 아이콘', () => {
    expect(diagIcon('ok')).toBe('🟢')
    expect(diagIcon('warn')).toBe('🟡')
    expect(diagIcon('fail')).toBe('🔴')
    expect(diagIcon('skip')).toBe('⚪')
  })
})

describe('formatDiagnostics', () => {
  const diags: Diagnostic[] = [
    { name: 'Node', status: 'ok', value: 'v20.18.0' },
    { name: 'pnpm', status: 'fail', value: '없음', advice: '설치: npm i -g pnpm' },
    { name: 'git', status: 'warn', value: '2.45', advice: 'user 설정 권장' },
  ]

  it('각 진단을 한 줄씩 + 아이콘', () => {
    const lines = formatDiagnostics(diags)
    expect(lines.some((l) => l.includes('Node') && l.includes('v20.18.0'))).toBe(true)
  })

  it('non-ok 항목만 권장 조치 블록에 모음', () => {
    const lines = formatDiagnostics(diags)
    const joined = lines.join('\n')
    expect(joined).toContain('권장 조치')
    expect(joined).toContain('npm i -g pnpm') // pnpm advice
    expect(joined).toContain('user 설정 권장') // git advice
  })

  it('전부 ok면 권장 조치 블록 없음', () => {
    const lines = formatDiagnostics([{ name: 'Node', status: 'ok', value: 'v20' }])
    expect(lines.join('\n')).not.toContain('권장 조치')
  })
})
