import { describe, it, expect, afterEach } from 'vitest'
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { coveredLinesByFile } from '../src/lib/coverage-parse.js'

const dirs: string[] = []
function tmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'covtest-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('coveredLinesByFile — v8 coverage-final.json → 커버 라인', () => {
  it('s[k]>0 인 statement 의 start..end 라인만 커버로 펼친다', () => {
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
    const m = coveredLinesByFile(jsonPath, cwd)
    expect(m).not.toBeNull()
    expect([...(m!.get('src/lib/foo.ts') ?? [])]).toEqual([1]) // 5,6은 s=0 → 미커버
  })

  it('리포트 파일 부재 → null (측정 불가, 빈 맵과 구분)', () => {
    expect(coveredLinesByFile('/no/such/coverage-final.json', '/x')).toBeNull()
  })

  it('손상된 json → null', () => {
    const cwd = tmpDir()
    const p = join(cwd, 'coverage-final.json')
    writeFileSync(p, '{not json', 'utf-8')
    expect(coveredLinesByFile(p, cwd)).toBeNull()
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
    expect(coveredLinesByFile(p, cwd)!.size).toBe(0)
  })
})
