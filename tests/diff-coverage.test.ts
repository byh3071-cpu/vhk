import { describe, it, expect } from 'vitest'
import { diffCoverage } from '../src/lib/diff-coverage.js'
import type { FileCoverage } from '../src/lib/coverage-parse.js'

const set = (...n: number[]) => new Set(n)
const cov = (covered: number[], executable: number[]): FileCoverage => ({
  covered: new Set(covered),
  executable: new Set(executable),
})

describe('diffCoverage — 실행가능 추가라인 ∩ 커버라인 교차', () => {
  it('실행가능 추가라인만 분모, 그중 미커버를 분리', () => {
    // 추가 1~6 중 실행가능은 1~4 (5,6은 비실행=주석/import). 커버는 1,2.
    const added = new Map([['src/lib/a.ts', set(1, 2, 3, 4, 5, 6)]])
    const coverage = new Map([['src/lib/a.ts', cov([1, 2], [1, 2, 3, 4])]])
    const r = diffCoverage(added, coverage)
    const f = r.files[0]
    expect(f).toMatchObject({ file: 'src/lib/a.ts', added: 4, covered: 2, uncoveredNew: [3, 4], inCoverage: true })
    expect(f.ratio).toBeCloseTo(0.5)
    expect(r).toMatchObject({ totalAdded: 4, totalCovered: 2, totalUncovered: 2 })
  })

  it('비실행 라인(주석·import·중괄호)만 추가됐으면 미검증 0 (노이즈 제외)', () => {
    const added = new Map([['src/lib/a.ts', set(1, 2, 3)]]) // 전부 비실행
    const coverage = new Map([['src/lib/a.ts', cov([10], [10, 11])]]) // 실행가능은 다른 라인
    const f = diffCoverage(added, coverage).files[0]
    expect(f).toMatchObject({ added: 0, covered: 0, uncoveredNew: [], ratio: 1 })
  })

  it('커버리지에 부재한 파일 = 전 추가라인 미검증(coarse) + inCoverage:false', () => {
    const added = new Map([['src/lib/new.ts', set(10, 11)]])
    const coverage = new Map<string, FileCoverage>() // 리포트엔 있으나 이 파일 없음
    const f = diffCoverage(added, coverage).files[0]
    expect(f).toMatchObject({ added: 2, covered: 0, uncoveredNew: [10, 11], inCoverage: false, ratio: 0 })
  })

  it('coverage=null(리포트 자체 없음)도 안전 — 전 라인 미검증', () => {
    const r = diffCoverage(new Map([['src/lib/a.ts', set(1)]]), null)
    expect(r.files[0]).toMatchObject({ covered: 0, uncoveredNew: [1], inCoverage: false })
  })

  it('변경 없음 → 빈 결과, 총비율 1', () => {
    const r = diffCoverage(new Map(), new Map())
    expect(r).toMatchObject({ files: [], totalAdded: 0, totalUncovered: 0, ratio: 1 })
  })

  it('파일은 이름순, 라인은 오름차순 정렬(결정성)', () => {
    const added = new Map([['src/lib/z.ts', set(2, 1)], ['src/commands/a.ts', set(5)]])
    const r = diffCoverage(added, new Map())
    expect(r.files.map((f) => f.file)).toEqual(['src/commands/a.ts', 'src/lib/z.ts'])
    expect(r.files[1].uncoveredNew).toEqual([1, 2])
  })
})
