import { describe, it, expect } from 'vitest'
import { formatReport } from '../src/commands/diff-cover.js'
import type { DiffCoverageResult } from '../src/lib/diff-coverage.js'

describe('formatReport — diff-coverage 결과 → 표시 라인(순수)', () => {
  it('미검증 변경분 있으면 파일별 미커버 라인 표시', () => {
    const r: DiffCoverageResult = {
      files: [{ file: 'src/lib/a.ts', added: 4, covered: 2, uncoveredNew: [3, 4], ratio: 0.5, inCoverage: true }],
      totalAdded: 4,
      totalCovered: 2,
      totalUncovered: 2,
      ratio: 0.5,
    }
    const out = formatReport(r).join('\n')
    expect(out).toContain('src/lib/a.ts')
    expect(out).toContain('3, 4') // 미커버 라인번호
    expect(out).toContain('2/4')
  })

  it('전부 커버되면 축하 라인', () => {
    const r: DiffCoverageResult = {
      files: [{ file: 'src/lib/a.ts', added: 2, covered: 2, uncoveredNew: [], ratio: 1, inCoverage: true }],
      totalAdded: 2,
      totalCovered: 2,
      totalUncovered: 0,
      ratio: 1,
    }
    expect(formatReport(r).join('\n')).toMatch(/모두|✅|100/)
  })

  it('inCoverage:false 파일은 "테스트 미import" 힌트', () => {
    const r: DiffCoverageResult = {
      files: [{ file: 'src/lib/new.ts', added: 2, covered: 0, uncoveredNew: [1, 2], ratio: 0, inCoverage: false }],
      totalAdded: 2,
      totalCovered: 0,
      totalUncovered: 2,
      ratio: 0,
    }
    expect(formatReport(r).join('\n')).toMatch(/import|테스트 안|미import/)
  })
})
