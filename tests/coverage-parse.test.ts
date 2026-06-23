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
})
