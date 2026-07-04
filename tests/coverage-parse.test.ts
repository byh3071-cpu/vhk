import { describe, it, expect, afterEach } from 'vitest'
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileCoverageByFile, COVERAGE_CORRUPT } from '../src/lib/coverage-parse.js'

const dirs: string[] = []
function tmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'covtest-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('fileCoverageByFile — v8 coverage-final.json → {covered, executable}', () => {
  it('executable = 모든 statement 라인, covered = s[k]>0 라인만', () => {
    const cwd = tmpDir()
    const abs = join(cwd, 'src/lib/foo.ts')
    const jsonPath = join(cwd, 'coverage-final.json')
    writeFileSync(
      jsonPath,
      JSON.stringify({
        [abs]: {
          path: abs,
          statementMap: {
            '0': { start: { line: 1 }, end: { line: 1 } },
            '1': { start: { line: 5 }, end: { line: 6 } },
          },
          s: { '0': 3, '1': 0 },
        },
      }),
      'utf-8'
    )
    const m = fileCoverageByFile(jsonPath, cwd)
    expect(m).not.toBeNull()
    const fc = m!.get('src/lib/foo.ts')!
    expect([...fc.executable].sort((a, b) => a - b)).toEqual([1, 5, 6])
    expect([...fc.covered]).toEqual([1]) // 5,6은 s=0 → executable 이나 미커버
  })

  it('리포트 파일 부재 → null (측정 불가, 빈 맵과 구분)', () => {
    expect(fileCoverageByFile('/no/such/coverage-final.json', '/x')).toBeNull()
  })

  // #321: 손상(파일은 실재, JSON.parse 실패)은 부재(null)와 구분돼야 한다 — 호출부가
  // '리포트 없음(새로 생성)' 대신 '리포트 손상(재생성 필요)'로 정직 보고하도록.
  it('#321 손상된 json(파일 실재) → COVERAGE_CORRUPT sentinel (null=부재와 구분)', () => {
    const cwd = tmpDir()
    const p = join(cwd, 'coverage-final.json')
    writeFileSync(p, '{not json', 'utf-8')
    expect(fileCoverageByFile(p, cwd)).toBe(COVERAGE_CORRUPT)
  })

  it('#321 빈 파일(0바이트, 실재)도 COVERAGE_CORRUPT (부재 아님)', () => {
    const cwd = tmpDir()
    const p = join(cwd, 'coverage-final.json')
    writeFileSync(p, '', 'utf-8')
    expect(fileCoverageByFile(p, cwd)).toBe(COVERAGE_CORRUPT)
  })

  it('기능소스 아닌 파일(tests/)은 제외', () => {
    const cwd = tmpDir()
    const abs = join(cwd, 'tests/a.test.ts')
    const p = join(cwd, 'coverage-final.json')
    writeFileSync(
      p,
      JSON.stringify({
        [abs]: { path: abs, statementMap: { '0': { start: { line: 1 }, end: { line: 1 } } }, s: { '0': 1 } },
      }),
      'utf-8'
    )
    expect(fileCoverageByFile(p, cwd)!.size).toBe(0)
  })

  // #375: branchMap/b — 단일줄 if(예: "if (x) return 'a'")는 whole-statement 가 hit 되면 s 상으로
  // 커버로 오판정되지만, 분기(true/false 또는 암묵 else) 중 하나가 안 밟히면 branchPartial 에 잡혀야 한다.
  it('#375 branchMap 있고 일부 location 이 미실행(hits 0) → branchPartial 에 해당 라인 추가', () => {
    const cwd = tmpDir()
    const abs = join(cwd, 'src/commands/audit.ts')
    const p = join(cwd, 'coverage-final.json')
    writeFileSync(
      p,
      JSON.stringify({
        [abs]: {
          path: abs,
          statementMap: { '0': { start: { line: 24 }, end: { line: 24 } } },
          s: { '0': 5 }, // whole-line statement 는 hit(오판정 대상)
          branchMap: {
            '0': {
              type: 'if',
              loc: { start: { line: 24 }, end: { line: 24 } },
              locations: [
                { start: { line: 24 }, end: { line: 24 } }, // consequent — 실행됨
                { start: { line: 24 }, end: { line: 24 } }, // 암묵 else — 미실행
              ],
            },
          },
          b: { '0': [5, 0] },
        },
      }),
      'utf-8'
    )
    const fc = fileCoverageByFile(p, cwd)!.get('src/commands/audit.ts')!
    expect(fc.covered.has(24)).toBe(true) // statement 는 여전히 covered(오판정 재현)
    expect([...fc.branchPartial]).toEqual([24]) // branch 레벨에서 미실행 잡힘
  })

  it('#375 branchMap 의 모든 location 이 hit(hits>0) → branchPartial 비어있음', () => {
    const cwd = tmpDir()
    const abs = join(cwd, 'src/lib/foo.ts')
    const p = join(cwd, 'coverage-final.json')
    writeFileSync(
      p,
      JSON.stringify({
        [abs]: {
          path: abs,
          statementMap: { '0': { start: { line: 10 }, end: { line: 10 } } },
          s: { '0': 3 },
          branchMap: {
            '0': {
              type: 'if',
              loc: { start: { line: 10 }, end: { line: 10 } },
              locations: [
                { start: { line: 10 }, end: { line: 10 } },
                { start: { line: 10 }, end: { line: 10 } },
              ],
            },
          },
          b: { '0': [2, 1] }, // 둘 다 hit
        },
      }),
      'utf-8'
    )
    const fc = fileCoverageByFile(p, cwd)!.get('src/lib/foo.ts')!
    expect(fc.branchPartial.size).toBe(0)
  })

  it('#375 branchMap 자체가 없는 파일 → branchPartial 빈 Set(required 필드, 크래시 없음)', () => {
    const cwd = tmpDir()
    const abs = join(cwd, 'src/lib/bar.ts')
    const p = join(cwd, 'coverage-final.json')
    writeFileSync(
      p,
      JSON.stringify({
        [abs]: {
          path: abs,
          statementMap: { '0': { start: { line: 1 }, end: { line: 1 } } },
          s: { '0': 1 },
        },
      }),
      'utf-8'
    )
    const fc = fileCoverageByFile(p, cwd)!.get('src/lib/bar.ts')!
    expect(fc.branchPartial).toBeInstanceOf(Set)
    expect(fc.branchPartial.size).toBe(0)
  })

  // location 에 line 정보가 없는 암묵 else(istanbul 흔한 케이스) → branch 자체(loc.start.line)로 폴백.
  it('#375 location.start.line 없음(암묵 else) → branch.loc.start.line 으로 폴백', () => {
    const cwd = tmpDir()
    const abs = join(cwd, 'src/lib/baz.ts')
    const p = join(cwd, 'coverage-final.json')
    writeFileSync(
      p,
      JSON.stringify({
        [abs]: {
          path: abs,
          statementMap: { '0': { start: { line: 7 }, end: { line: 7 } } },
          s: { '0': 1 },
          branchMap: {
            '0': {
              type: 'if',
              loc: { start: { line: 7 }, end: { line: 7 } },
              locations: [
                { start: { line: 7 }, end: { line: 7 } },
                { start: {}, end: {} }, // 암묵 else — line 정보 없음
              ],
            },
          },
          b: { '0': [1, 0] },
        },
      }),
      'utf-8'
    )
    const fc = fileCoverageByFile(p, cwd)!.get('src/lib/baz.ts')!
    expect([...fc.branchPartial]).toEqual([7])
  })
})
