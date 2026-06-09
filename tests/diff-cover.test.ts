import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// diffCover() 오케스트레이션 분기 테스트용 — 저수준 IO/순수 의존을 mock.
// (diff-coverage 는 실제 순수함수 사용 — 교차 로직은 그대로 검증.)
vi.mock('../src/lib/exec.js', () => ({ safeExecFile: vi.fn() }))
vi.mock('../src/lib/git-session.js', () => ({ diffUnified0: vi.fn() }))
vi.mock('../src/lib/diff-hunks.js', () => ({ addedLinesByFile: vi.fn() }))
vi.mock('../src/lib/coverage-parse.js', () => ({ fileCoverageByFile: vi.fn() }))
vi.mock('../src/lib/hard-stop-guard.js', () => ({ ensureNotHardStopped: vi.fn(() => true) }))

import { formatReport, diffCover } from '../src/commands/diff-cover.js'
import { safeExecFile } from '../src/lib/exec.js'
import { diffUnified0 } from '../src/lib/git-session.js'
import { addedLinesByFile } from '../src/lib/diff-hunks.js'
import { fileCoverageByFile } from '../src/lib/coverage-parse.js'
import type { DiffCoverageResult } from '../src/lib/diff-coverage.js'
import type { FileCoverage } from '../src/lib/coverage-parse.js'

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
    expect(out).toContain('3, 4')
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

describe('diffCover — 오케스트레이션 분기(자문형·차단 0)', () => {
  let logs: string[]
  let errs: string[]
  const mockExec = vi.mocked(safeExecFile)
  const mockDiff = vi.mocked(diffUnified0)
  const mockAdded = vi.mocked(addedLinesByFile)
  const mockCov = vi.mocked(fileCoverageByFile)

  beforeEach(() => {
    vi.clearAllMocks()
    logs = []
    errs = []
    vi.spyOn(console, 'log').mockImplementation((m?: unknown) => { logs.push(String(m)) })
    vi.spyOn(console, 'error').mockImplementation((m?: unknown) => { errs.push(String(m)) })
    process.exitCode = undefined
    // 기본값: 저장소 O, diff 있음, 변경 1파일.
    mockExec.mockReturnValue({ ok: true, out: 'true' })
    mockDiff.mockReturnValue({ ok: true, out: 'irrelevant(mocked)' })
    mockAdded.mockReturnValue(new Map([['src/lib/a.ts', new Set([10, 11])]]))
  })
  afterEach(() => {
    vi.restoreAllMocks()
    process.exitCode = undefined
  })

  it('git 저장소 아님 → exit 1 + 에러', async () => {
    mockExec.mockReturnValue({ ok: false, err: 'not a repo', out: '' })
    await diffCover()
    expect(process.exitCode).toBe(1)
    expect(errs.join('\n')).toContain('git 저장소')
  })

  it('변경된 기능소스 없음 → 측정 대상 없음(exit 0)', async () => {
    mockAdded.mockReturnValue(new Map())
    await diffCover()
    expect(process.exitCode).not.toBe(1)
    expect(logs.join('\n')).toContain('측정 대상 없음')
  })

  it('커버리지 리포트 없음 → exit 1 + 안내', async () => {
    mockCov.mockReturnValue(null)
    await diffCover()
    expect(process.exitCode).toBe(1)
    expect(errs.join('\n')).toContain('커버리지 리포트 없음')
  })

  it('정상 — 미검증 변경분 있어도 advisory(exit 0) + 보고', async () => {
    const fc: FileCoverage = { covered: new Set([10]), executable: new Set([10, 11]) }
    mockCov.mockReturnValue(new Map([['src/lib/a.ts', fc]]))
    await diffCover()
    expect(process.exitCode).not.toBe(1) // 측정 결과로는 차단 안 함
    const out = logs.join('\n')
    expect(out).toContain('미검증 변경분')
    expect(out).toContain('11') // 미커버 라인
    expect(out).toContain('자문형')
  })
})
