import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// diffCover() 오케스트레이션 분기 테스트용 — 저수준 IO/순수 의존을 mock.
// (diff-coverage 는 실제 순수함수 사용 — 교차 로직은 그대로 검증.)
vi.mock('../src/lib/exec.js', () => ({ safeExecFile: vi.fn() }))
vi.mock('../src/lib/git-session.js', () => ({ diffUnified0: vi.fn(), untrackedFiles: vi.fn() }))
vi.mock('../src/lib/diff-hunks.js', () => ({ addedLinesByFile: vi.fn() }))
// COVERAGE_CORRUPT 는 실값(sentinel) 유지 — fileCoverageByFile 만 mock.
vi.mock('../src/lib/coverage-parse.js', async (orig) => {
  const actual = await orig<typeof import('../src/lib/coverage-parse.js')>()
  return { ...actual, fileCoverageByFile: vi.fn() }
})
vi.mock('../src/lib/hard-stop-guard.js', () => ({ ensureNotHardStopped: vi.fn(() => true) }))

import { formatReport, diffCover, untrackedFeatureSources } from '../src/commands/diff-cover.js'
import { safeExecFile } from '../src/lib/exec.js'
import { diffUnified0, untrackedFiles } from '../src/lib/git-session.js'
import { addedLinesByFile } from '../src/lib/diff-hunks.js'
import { fileCoverageByFile, COVERAGE_CORRUPT } from '../src/lib/coverage-parse.js'
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
  const mockUntracked = vi.mocked(untrackedFiles)

  beforeEach(() => {
    vi.clearAllMocks()
    logs = []
    errs = []
    vi.spyOn(console, 'log').mockImplementation((m?: unknown) => { logs.push(String(m)) })
    vi.spyOn(console, 'error').mockImplementation((m?: unknown) => { errs.push(String(m)) })
    process.exitCode = undefined
    // 기본값: 저장소 O, diff 있음, 변경 1파일, untracked 없음.
    mockExec.mockReturnValue({ ok: true, out: 'true' })
    mockDiff.mockReturnValue({ ok: true, out: 'irrelevant(mocked)' })
    mockAdded.mockReturnValue(new Map([['src/lib/a.ts', new Set([10, 11])]]))
    mockUntracked.mockReturnValue({ ok: true, out: '' })
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

  it('변경된 기능소스 없음(untracked 도 없음) → 측정 대상 없음(exit 0)', async () => {
    mockAdded.mockReturnValue(new Map())
    await diffCover()
    expect(process.exitCode).not.toBe(1)
    expect(logs.join('\n')).toContain('측정 대상 없음')
  })

  // #320: tracked 변경은 없지만 untracked 신규 기능소스가 있으면 '측정 대상 없음' 단정 금지 —
  // 가장 미검증 위험 높은 신규 모듈을 능동적으로 오도하지 않게 정직 안내.
  it('#320 변경 없음 but untracked 기능소스 있음 → "git add 후 측정" 안내(은폐 0)', async () => {
    mockAdded.mockReturnValue(new Map())
    mockUntracked.mockReturnValue({ ok: true, out: 'src/lib/brandnew.ts\nREADME.md' })
    await diffCover()
    const out = logs.join('\n') + errs.join('\n')
    expect(out).not.toContain('측정 대상 없음') // 거짓 단정 금지
    expect(out).toContain('src/lib/brandnew.ts') // 위험 파일 명시
    expect(out).toMatch(/git add/) // 조치 안내
    expect(out).not.toContain('README.md') // 기능소스 아닌 건 제외
  })

  it('커버리지 리포트 없음(부재) → exit 1 + 안내', async () => {
    mockCov.mockReturnValue(null)
    await diffCover()
    expect(process.exitCode).toBe(1)
    expect(errs.join('\n')).toContain('커버리지 리포트 없음')
  })

  // #321: 손상(파일 실재, parse 실패)을 '없음'으로 보고하면 은폐 — '손상'으로 구분 보고.
  it('#321 커버리지 리포트 손상 → "손상" 보고(exit 1, "없음" 아님)', async () => {
    mockCov.mockReturnValue(COVERAGE_CORRUPT)
    await diffCover()
    expect(process.exitCode).toBe(1)
    const out = errs.join('\n')
    expect(out).toContain('손상')
    expect(out).not.toContain('리포트 없음') // 부재로 오인 금지
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

describe('untrackedFeatureSources — ls-files 출력 → 기능소스만(순수, #320)', () => {
  it('src/commands·src/lib 의 .ts 만 골라낸다(문서·테스트·기타 제외)', () => {
    const out = [
      'src/lib/brandnew.ts',
      'src/commands/new-cmd.ts',
      'README.md',
      'src/lib/x.test.ts',
      'docs/note.md',
      'src/other/z.ts',
    ].join('\n')
    expect(untrackedFeatureSources(out)).toEqual(['src/commands/new-cmd.ts', 'src/lib/brandnew.ts'])
  })

  it('빈 출력 → 빈 배열', () => {
    expect(untrackedFeatureSources('')).toEqual([])
    expect(untrackedFeatureSources('   \n  ')).toEqual([])
  })

  it('Windows 백슬래시 경로도 posix 정규화 후 인식', () => {
    expect(untrackedFeatureSources('src\\lib\\foo.ts')).toEqual(['src/lib/foo.ts'])
  })
})
