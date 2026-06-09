import { describe, it, expect } from 'vitest'
import { diffCoverage } from '../src/lib/diff-coverage.js'

const set = (...n: number[]) => new Set(n)

describe('diffCoverage — 추가라인 ∩ 커버라인 교차', () => {
  it('커버된/미커버 추가라인을 분리하고 비율 계산', () => {
    const added = new Map([['src/lib/a.ts', set(1, 2, 3, 4)]])
    const covered = new Map([['src/lib/a.ts', set(1, 2)]])
    const r = diffCoverage(added, covered)
    const f = r.files[0]
    expect(f).toMatchObject({ file: 'src/lib/a.ts', added: 4, covered: 2, uncoveredNew: [3, 4], inCoverage: true })
    expect(f.ratio).toBeCloseTo(0.5)
    expect(r).toMatchObject({ totalAdded: 4, totalCovered: 2, totalUncovered: 2 })
  })

  it('커버리지에 부재한 파일 = 전 라인 미검증 + inCoverage:false', () => {
    const added = new Map([['src/lib/new.ts', set(10, 11)]])
    const covered = new Map<string, Set<number>>() // 리포트엔 있으나 이 파일 없음
    const f = diffCoverage(added, covered).files[0]
    expect(f).toMatchObject({ added: 2, covered: 0, uncoveredNew: [10, 11], inCoverage: false, ratio: 0 })
  })

  it('covered=null(리포트 자체 없음)도 안전 — 전 라인 미검증', () => {
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
