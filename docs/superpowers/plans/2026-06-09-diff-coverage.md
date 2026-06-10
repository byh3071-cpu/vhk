# diff-coverage (RFC 0050 PR1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "이번 변경(HEAD 대비)이 실제로 테스트에 실행됐나"를 측정하는 자문형 `vhk diff-cover` 명령 + coverage 인프라. 차단 0 (advisory).

**Architecture:** 순수 seam 4단(diff-hunks=git텍스트→추가라인 / coverage-parse=v8json→커버라인 / diff-coverage=교차 / command=조립·출력). git 호출은 git-session 단일 SoT 확장. review.ts의 crossCheck 순수함수 패턴 답습.

**Tech Stack:** TypeScript, vitest 4.1.7, @vitest/coverage-v8(v8 provider), commander(CLI), chalk. git `diff --unified=0 HEAD`.

**참조:** 설계 = [docs/rfc/0050-diff-coverage-gate.md](../../rfc/0050-diff-coverage-gate.md). 미션카드 = [goals/50-coverage-diff-gate.md](../../../goals/50-coverage-diff-gate.md).

---

## File Structure

| 파일 | 책임 | 신규/수정 |
|------|------|-----------|
| `vitest.config.ts` | coverage 블록(v8, json reporter) | 수정 |
| `package.json` | `@vitest/coverage-v8` devDep | 수정 |
| `src/lib/git-session.ts` | `diffUnified0()` — 라인번호 보존 git diff (단일 SoT) | 수정 |
| `src/lib/diff-hunks.ts` | `addedLinesByFile()` — diff텍스트→기능소스별 추가라인 (순수) | 신규 |
| `src/lib/coverage-parse.ts` | `coveredLinesByFile()` — coverage-final.json→커버라인 (IO+파싱) | 신규 |
| `src/lib/diff-coverage.ts` | `diffCoverage()` — 두 맵 교차→미검증 변경분 (순수) | 신규 |
| `src/commands/diff-cover.ts` | `formatReport()`(순수) + `diffCover()`(조립·출력) | 신규 |
| `src/index.ts` | 명령 등록(import·별칭맵·`.command()`) | 수정 |
| `tests/diff-hunks.test.ts` `tests/coverage-parse.test.ts` `tests/diff-coverage.test.ts` `tests/diff-cover.test.ts` | 단위테스트 | 신규 |

---

## Task 1: coverage 인프라

**Files:**
- Modify: `package.json` (devDependencies)
- Modify: `vitest.config.ts`

- [ ] **Step 1: @vitest/coverage-v8 설치 (vitest와 동일 버전)**

Run: `pnpm add -D @vitest/coverage-v8@4.1.7`
Expected: package.json devDependencies에 `"@vitest/coverage-v8": "^4.1.7"` 추가, 설치 성공.

- [ ] **Step 2: vitest.config.ts coverage 블록 추가**

`vitest.config.ts` 전체를 아래로 교체:

```ts
import { defineConfig } from 'vitest/config'

// vitest 기본 exclude 에 .claude/** 추가(워크트리 복사본 중복수집 차단).
export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**'],
    // Goal 50 / RFC 0050: coverage 측정(차단 아님, 리포트+diff-cover 입력용).
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: ['dist/**', '.claude/**', 'tests/**', '**/*.config.*', 'src/**/*.d.ts', 'src/index.ts'],
    },
  },
})
```

(`src/index.ts`는 CLI 엔트리·commander 배선이라 coverage 분모에서 제외 — diff-cover 대상도 src/commands·src/lib뿐.)

- [ ] **Step 3: coverage 생성 확인**

Run: `pnpm test:run --coverage`
Expected: 전체 테스트 PASS + `coverage/coverage-final.json` 생성. 콘솔에 text-summary 표시.

- [ ] **Step 4: coverage 산출물 gitignore 확인**

Run: `git check-ignore coverage/coverage-final.json`
Expected: `coverage/...` 출력(이미 무시됨). 안 되면 `.gitignore`에 `coverage/` 추가.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts .gitignore
git commit -m "feat(goal-50): coverage 인프라 — @vitest/coverage-v8 + vitest.config v8 블록"
```

---

## Task 2: git-session.diffUnified0 (라인번호 보존 diff)

**Files:**
- Modify: `src/lib/git-session.ts`
- Test: `tests/git-session.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`tests/git-session.test.ts`의 마지막 `it(...)` 뒤(같은 describe 안)에 추가:

```ts
  it('diffUnified0 → git diff --unified=0 HEAD (raw 보존)', () => {
    session.diffUnified0('/repo')
    expect(lastBin()).toBe('git')
    expect(lastArgv()).toEqual(['diff', '--unified=0', 'HEAD'])
    // 헌트 헤더 라인번호 보존 위해 trimOutput:false.
    expect(lastOpts()).toMatchObject({ cwd: '/repo', trimOutput: false })
  })
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test:run -- tests/git-session.test.ts`
Expected: FAIL — `session.diffUnified0 is not a function`.

- [ ] **Step 3: 구현**

`src/lib/git-session.ts`의 `numstatHead` 함수 바로 뒤에 추가:

```ts
/** git diff --unified=0 HEAD — 헌트 헤더(@@ -a,b +c,d @@)로 추가 라인번호 추출용. raw 보존. */
export function diffUnified0(cwd: string = process.cwd()): ExecResult {
  return safeExecFile('git', ['diff', '--unified=0', 'HEAD'], { cwd, trimOutput: false })
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test:run -- tests/git-session.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/git-session.ts tests/git-session.test.ts
git commit -m "feat(goal-50): git-session.diffUnified0 — 라인단위 diff (단일 SoT 확장)"
```

---

## Task 3: diff-hunks.addedLinesByFile (순수 파서)

**Files:**
- Create: `src/lib/diff-hunks.ts`
- Test: `tests/diff-hunks.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`tests/diff-hunks.test.ts` 생성:

```ts
import { describe, it, expect } from 'vitest'
import { addedLinesByFile } from '../src/lib/diff-hunks.js'

describe('addedLinesByFile — unified=0 diff → 기능소스별 추가 라인', () => {
  it('단일 헌트(+c,d) 추가 라인을 c..c+d-1로 펼친다', () => {
    const diff = [
      'diff --git a/src/lib/foo.ts b/src/lib/foo.ts',
      '--- a/src/lib/foo.ts',
      '+++ b/src/lib/foo.ts',
      '@@ -10,0 +11,3 @@',
      '+a',
      '+b',
      '+c',
    ].join('\n')
    const m = addedLinesByFile(diff)
    expect([...(m.get('src/lib/foo.ts') ?? [])]).toEqual([11, 12, 13])
  })

  it('count 생략형 @@ +c @@ = 1줄', () => {
    const diff = 'diff --git a/src/lib/x.ts b/src/lib/x.ts\n+++ b/src/lib/x.ts\n@@ -5 +5 @@\n+one'
    expect([...(addedLinesByFile(diff).get('src/lib/x.ts') ?? [])]).toEqual([5])
  })

  it('순수 삭제 헌트(+c,0)는 추가 0', () => {
    const diff = 'diff --git a/src/lib/x.ts b/src/lib/x.ts\n+++ b/src/lib/x.ts\n@@ -5,3 +4,0 @@'
    expect(addedLinesByFile(diff).has('src/lib/x.ts')).toBe(false)
  })

  it('한 파일 멀티헌트는 누적된다', () => {
    const diff = [
      'diff --git a/src/commands/c.ts b/src/commands/c.ts',
      '+++ b/src/commands/c.ts',
      '@@ -1,0 +1,1 @@',
      '+x',
      '@@ -10,0 +20,2 @@',
      '+y',
      '+z',
    ].join('\n')
    expect([...(addedLinesByFile(diff).get('src/commands/c.ts') ?? [])]).toEqual([1, 20, 21])
  })

  it('기능소스 아닌 파일(테스트·문서·tests/)은 무시', () => {
    const diff = [
      'diff --git a/docs/x.md b/docs/x.md\n+++ b/docs/x.md\n@@ -1,0 +1,1 @@\n+m',
      'diff --git a/src/lib/x.test.ts b/src/lib/x.test.ts\n+++ b/src/lib/x.test.ts\n@@ -1,0 +1,1 @@\n+t',
    ].join('\n')
    expect(addedLinesByFile(diff).size).toBe(0)
  })

  it('삭제 파일(+++ /dev/null)은 무시', () => {
    const diff = 'diff --git a/src/lib/g.ts b/src/lib/g.ts\n--- a/src/lib/g.ts\n+++ /dev/null\n@@ -1,2 +0,0 @@'
    expect(addedLinesByFile(diff).size).toBe(0)
  })

  it('빈 diff → 빈 맵', () => {
    expect(addedLinesByFile('').size).toBe(0)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test:run -- tests/diff-hunks.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/diff-hunks.js'`.

- [ ] **Step 3: 구현**

`src/lib/diff-hunks.ts` 생성:

```ts
import { isFeatureSource, toPosix } from './test-mapping.js'

/**
 * `git diff --unified=0 HEAD` 텍스트 → 기능소스(src/commands·src/lib)별 추가 라인번호 집합.
 * 순수 함수. 헌트 헤더(@@ -a,b +c,d @@)만으로 추가 라인을 계산한다(본문 +라인 셀 필요 없음, -U0이라 컨텍스트 0).
 * 파일 경계는 `diff --git` 에서 리셋, 대상 파일은 `+++ b/<path>` 에서 확정(삭제=+++ /dev/null → 제외).
 */
export function addedLinesByFile(diffText: string): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>()
  let curFile: string | null = null
  for (const raw of diffText.split(/\r?\n/)) {
    if (raw.startsWith('diff --git ')) {
      curFile = null // 파일 경계 — 다음 +++ 로 다시 확정(binary/rename은 +++ 없음 → null 유지).
      continue
    }
    const plus = raw.match(/^\+\+\+ (?:b\/)?(.+)$/)
    if (plus) {
      const path = plus[1].trim()
      curFile = path !== '/dev/null' && isFeatureSource(path) ? toPosix(path) : null
      continue
    }
    if (!curFile) continue
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/)
    if (!hunk) continue
    const start = Number(hunk[1])
    const count = hunk[2] === undefined ? 1 : Number(hunk[2])
    if (count <= 0) continue // 순수 삭제 헌트(+c,0).
    const set = out.get(curFile) ?? new Set<number>()
    for (let i = 0; i < count; i++) set.add(start + i)
    out.set(curFile, set)
  }
  return out
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test:run -- tests/diff-hunks.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/diff-hunks.ts tests/diff-hunks.test.ts
git commit -m "feat(goal-50): diff-hunks.addedLinesByFile — unified=0 diff 파서(순수)"
```

---

## Task 4: coverage-parse.coveredLinesByFile (v8 json → 커버 라인)

**Files:**
- Create: `src/lib/coverage-parse.ts`
- Test: `tests/coverage-parse.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`tests/coverage-parse.test.ts` 생성 (임시 파일에 v8 형식 json 써서 파싱 검증):

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { coveredLinesByFile } from '../src/lib/coverage-parse.js'

const dirs: string[] = []
function tmpJson(obj: unknown): { jsonPath: string; cwd: string } {
  const cwd = mkdtempSync(join(tmpdir(), 'covtest-'))
  dirs.push(cwd)
  const jsonPath = join(cwd, 'coverage-final.json')
  writeFileSync(jsonPath, JSON.stringify(obj), 'utf-8')
  return { jsonPath, cwd }
}
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }) })

describe('coveredLinesByFile — v8 coverage-final.json → 커버 라인', () => {
  it('s[k]>0 인 statement 의 start..end 라인만 커버로 펼친다', () => {
    const { jsonPath, cwd } = tmpJson({
      [join(cwd0(), 'src/lib/foo.ts')]: {
        path: join(cwd0(), 'src/lib/foo.ts'),
        statementMap: { '0': { start: { line: 1 }, end: { line: 1 } }, '1': { start: { line: 5 }, end: { line: 6 } } },
        s: { '0': 3, '1': 0 },
      },
    })
    function cwd0() { return cwd }
    const m = coveredLinesByFile(jsonPath, cwd)
    expect(m).not.toBeNull()
    expect([...(m!.get('src/lib/foo.ts') ?? [])]).toEqual([1]) // 5,6은 s=0 → 미커버
  })

  it('리포트 파일 부재 → null (측정 불가, 빈 맵과 구분)', () => {
    expect(coveredLinesByFile('/no/such/coverage-final.json', '/x')).toBeNull()
  })

  it('손상된 json → null', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'covtest-')); dirs.push(cwd)
    const p = join(cwd, 'coverage-final.json'); writeFileSync(p, '{not json', 'utf-8')
    expect(coveredLinesByFile(p, cwd)).toBeNull()
  })

  it('기능소스 아닌 파일(tests/·index.ts)은 제외', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'covtest-')); dirs.push(cwd)
    const p = join(cwd, 'coverage-final.json')
    writeFileSync(p, JSON.stringify({
      [join(cwd, 'tests/a.test.ts')]: { path: join(cwd, 'tests/a.test.ts'), statementMap: { '0': { start: { line: 1 }, end: { line: 1 } } }, s: { '0': 1 } },
    }), 'utf-8')
    expect(coveredLinesByFile(p, cwd)!.size).toBe(0)
  })
})
```

> ⚠️ 위 첫 테스트의 `cwd0()` 호이스팅 회피가 지저분하므로 구현 단계에서 아래처럼 정리한다(객체 키를 변수로):
> ```ts
> it('s[k]>0 ...', () => {
>   const cwd = mkdtempSync(join(tmpdir(), 'covtest-')); dirs.push(cwd)
>   const abs = join(cwd, 'src/lib/foo.ts')
>   const jsonPath = join(cwd, 'coverage-final.json')
>   writeFileSync(jsonPath, JSON.stringify({ [abs]: { path: abs, statementMap: { '0': { start: { line: 1 }, end: { line: 1 } }, '1': { start: { line: 5 }, end: { line: 6 } } }, s: { '0': 3, '1': 0 } } }), 'utf-8')
>   const m = coveredLinesByFile(jsonPath, cwd)
>   expect([...(m!.get('src/lib/foo.ts') ?? [])]).toEqual([1])
> })
> ```
> 실제 작성 시 이 정리본을 쓸 것(첫 블록의 `tmpJson`/`cwd0` 버전 폐기).

- [ ] **Step 2: 실패 확인**

Run: `pnpm test:run -- tests/coverage-parse.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`src/lib/coverage-parse.ts` 생성:

```ts
import { existsSync, readFileSync } from 'node:fs'
import { relative } from 'node:path'
import { isFeatureSource, toPosix } from './test-mapping.js'

interface V8FileCov {
  path?: string
  statementMap?: Record<string, { start: { line: number }; end: { line: number } }>
  s?: Record<string, number>
}

/**
 * v8 coverage-final.json → 기능소스(src/commands·src/lib)별 "실행된(커버된)" 라인 집합.
 * - 리포트 파일 부재/손상 → null (측정 불가 — diff-coverage 가 "먼저 --coverage" 안내).
 * - 리포트 존재 but 특정 파일 부재 → 그 파일은 맵에 없음(= 테스트가 import 안 함 → 전 라인 미커버로 처리됨).
 * 경로: 절대경로 키 → cwd 상대 posix 정규화(git rel posix 와 매칭).
 */
export function coveredLinesByFile(jsonPath: string, cwd: string = process.cwd()): Map<string, Set<number>> | null {
  if (!existsSync(jsonPath)) return null
  let data: Record<string, V8FileCov>
  try {
    data = JSON.parse(readFileSync(jsonPath, 'utf-8')) as Record<string, V8FileCov>
  } catch {
    return null
  }
  const out = new Map<string, Set<number>>()
  for (const [absKey, cov] of Object.entries(data)) {
    const rel = toPosix(relative(cwd, cov.path ?? absKey))
    if (!isFeatureSource(rel)) continue
    const set = new Set<number>()
    const sMap = cov.statementMap ?? {}
    const counts = cov.s ?? {}
    for (const [k, stmt] of Object.entries(sMap)) {
      if ((counts[k] ?? 0) > 0) {
        for (let l = stmt.start.line; l <= stmt.end.line; l++) set.add(l)
      }
    }
    out.set(rel, set)
  }
  return out
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test:run -- tests/coverage-parse.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/coverage-parse.ts tests/coverage-parse.test.ts
git commit -m "feat(goal-50): coverage-parse.coveredLinesByFile — v8 json 파싱(부재≠빈맵)"
```

---

## Task 5: diff-coverage.diffCoverage (순수 교차)

**Files:**
- Create: `src/lib/diff-coverage.ts`
- Test: `tests/diff-coverage.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`tests/diff-coverage.test.ts` 생성:

```ts
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
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test:run -- tests/diff-coverage.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`src/lib/diff-coverage.ts` 생성:

```ts
export interface FileDiffCoverage {
  file: string
  added: number
  covered: number
  uncoveredNew: number[]
  ratio: number // added===0 ? 1 : covered/added
  inCoverage: boolean // 커버리지 리포트에 이 파일이 존재했나(false = 테스트가 import 안 함)
}

export interface DiffCoverageResult {
  files: FileDiffCoverage[]
  totalAdded: number
  totalCovered: number
  totalUncovered: number
  ratio: number
}

/**
 * 추가라인 맵 ∩ 커버라인 맵 → 파일별 미검증 변경분(순수). fs/시간 부수효과 0.
 * @param covered 커버라인 맵 또는 null(리포트 자체 부재 — 전 라인 미검증으로 처리, 호출부가 별도 안내).
 */
export function diffCoverage(
  added: Map<string, Set<number>>,
  covered: Map<string, Set<number>> | null
): DiffCoverageResult {
  const files: FileDiffCoverage[] = []
  let totalAdded = 0
  let totalCovered = 0
  const sortedFiles = [...added.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  for (const [file, addedLines] of sortedFiles) {
    const cov = covered?.get(file) ?? null
    const inCoverage = cov !== null
    const uncoveredNew: number[] = []
    let cnt = 0
    for (const ln of [...addedLines].sort((a, b) => a - b)) {
      if (cov && cov.has(ln)) cnt++
      else uncoveredNew.push(ln)
    }
    const addedN = addedLines.size
    files.push({ file, added: addedN, covered: cnt, uncoveredNew, ratio: addedN === 0 ? 1 : cnt / addedN, inCoverage })
    totalAdded += addedN
    totalCovered += cnt
  }
  return {
    files,
    totalAdded,
    totalCovered,
    totalUncovered: totalAdded - totalCovered,
    ratio: totalAdded === 0 ? 1 : totalCovered / totalAdded,
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test:run -- tests/diff-coverage.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/diff-coverage.ts tests/diff-coverage.test.ts
git commit -m "feat(goal-50): diff-coverage.diffCoverage — 미검증 변경분 교차(순수)"
```

---

## Task 6: diff-cover 명령 + 등록

**Files:**
- Create: `src/commands/diff-cover.ts`
- Modify: `src/index.ts`
- Test: `tests/diff-cover.test.ts`

- [ ] **Step 1: formatReport 실패 테스트 작성**

`tests/diff-cover.test.ts` 생성 (출력은 순수 `formatReport`로 테스트, IO는 스모크로):

```ts
import { describe, it, expect } from 'vitest'
import { formatReport } from '../src/commands/diff-cover.js'
import type { DiffCoverageResult } from '../src/lib/diff-coverage.js'

describe('formatReport — diff-coverage 결과 → 표시 라인(순수)', () => {
  it('미검증 변경분 있으면 파일별 미커버 라인 표시', () => {
    const r: DiffCoverageResult = {
      files: [{ file: 'src/lib/a.ts', added: 4, covered: 2, uncoveredNew: [3, 4], ratio: 0.5, inCoverage: true }],
      totalAdded: 4, totalCovered: 2, totalUncovered: 2, ratio: 0.5,
    }
    const out = formatReport(r).join('\n')
    expect(out).toContain('src/lib/a.ts')
    expect(out).toContain('3, 4') // 미커버 라인번호
    expect(out).toContain('2/4') // 또는 50%
  })

  it('전부 커버되면 축하 라인', () => {
    const r: DiffCoverageResult = {
      files: [{ file: 'src/lib/a.ts', added: 2, covered: 2, uncoveredNew: [], ratio: 1, inCoverage: true }],
      totalAdded: 2, totalCovered: 2, totalUncovered: 0, ratio: 1,
    }
    expect(formatReport(r).join('\n')).toMatch(/모두|✅|100/)
  })

  it('inCoverage:false 파일은 "테스트 미import" 힌트', () => {
    const r: DiffCoverageResult = {
      files: [{ file: 'src/lib/new.ts', added: 2, covered: 0, uncoveredNew: [1, 2], ratio: 0, inCoverage: false }],
      totalAdded: 2, totalCovered: 0, totalUncovered: 2, ratio: 0,
    }
    expect(formatReport(r).join('\n')).toMatch(/import|테스트 안|미import/)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test:run -- tests/diff-cover.test.ts`
Expected: FAIL — 모듈/`formatReport` 없음.

- [ ] **Step 3: 명령 구현**

`src/commands/diff-cover.ts` 생성:

```ts
import { join } from 'node:path'
import chalk from 'chalk'
import { safeExecFile } from '../lib/exec.js'
import { diffUnified0 } from '../lib/git-session.js'
import { addedLinesByFile } from '../lib/diff-hunks.js'
import { coveredLinesByFile } from '../lib/coverage-parse.js'
import { diffCoverage, type DiffCoverageResult } from '../lib/diff-coverage.js'
import { ensureNotHardStopped } from '../lib/hard-stop-guard.js'

const COVERAGE_JSON_REL = 'coverage/coverage-final.json'

/** diff-coverage 결과 → 표시 라인(순수, chalk 없음 — 테스트 용이). */
export function formatReport(r: DiffCoverageResult): string[] {
  const lines: string[] = []
  if (r.totalUncovered === 0) {
    lines.push('✅ 이번 변경의 모든 추가 라인이 테스트로 커버됨 (미검증 변경분 0).')
    return lines
  }
  const pct = Math.round(r.ratio * 100)
  lines.push(`미검증 변경분 ${r.totalUncovered}라인 / 추가 ${r.totalAdded}라인 (커버 ${pct}%)`)
  for (const f of r.files) {
    if (f.uncoveredNew.length === 0) continue
    const hint = f.inCoverage ? '' : '  ← 테스트가 이 파일을 import 안 함(전부 미검증)'
    lines.push(`  ${f.file}: 미커버 ${f.uncoveredNew.length}/${f.added} → 라인 ${f.uncoveredNew.join(', ')}${hint}`)
  }
  return lines
}

/**
 * vhk diff-cover — HEAD 대비 변경된 기능소스가 테스트로 실행됐나 측정(자문형·차단 0).
 * 측정 결과(미검증 변경분 존재)로는 exit 1 안 함. 운영 전제 실패(저장소 아님/리포트 없음)만 exit 1.
 */
export async function diffCover(): Promise<void> {
  if (!ensureNotHardStopped('diff-cover')) return
  const cwd = process.cwd()

  console.log(chalk.bold('\n🔬 diff-coverage — 이번 변경이 테스트로 닿았나'))
  console.log(chalk.gray('─'.repeat(44)))

  if (!safeExecFile('git', ['rev-parse', '--is-inside-work-tree'], { cwd }).ok) {
    console.error(chalk.red('  ❌ git 저장소가 아닙니다.'))
    process.exitCode = 1
    return
  }

  const diffRes = diffUnified0(cwd)
  const added = addedLinesByFile(diffRes.ok ? diffRes.out : '')
  if (added.size === 0) {
    console.log(chalk.green('\n  ✅ HEAD 대비 변경된 기능소스(src/commands·src/lib) 없음 — 측정 대상 없음.'))
    return
  }

  const covPath = join(cwd, COVERAGE_JSON_REL)
  const covered = coveredLinesByFile(covPath, cwd)
  if (covered === null) {
    console.error(chalk.yellow(`\n  ⚠️  커버리지 리포트 없음(${COVERAGE_JSON_REL}). 먼저 생성하세요:`))
    console.error(chalk.cyan('     pnpm test:run --coverage'))
    process.exitCode = 1
    return
  }

  const result = diffCoverage(added, covered)
  const out = formatReport(result)
  const color = result.totalUncovered === 0 ? chalk.green : chalk.yellow
  console.log('\n' + out.map((l) => color(l)).join('\n'))
  console.log(chalk.dim('\n  ℹ️  자문형(advisory) — 차단하지 않습니다. 미검증 변경분은 테스트 보강을 권장하는 신호입니다.'))
  // 측정 결과로는 exit 0 유지(advisory).
}
```

- [ ] **Step 4: formatReport 통과 확인**

Run: `pnpm test:run -- tests/diff-cover.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: index.ts 등록 (import)**

`src/index.ts` 상단 import 블록(약 line 20, `import { diff } from './commands/diff.js'` 근처)에 추가:

```ts
import { diffCover } from './commands/diff-cover.js'
```

- [ ] **Step 6: index.ts 등록 (별칭 맵)**

별칭 맵(약 line 135, `diff: '변경',` 줄 아래)에 추가:

```ts
  'diff-cover': '커버리지',
```

- [ ] **Step 7: index.ts 등록 (명령 정의)**

`.command('diff')...action(diff)` 블록(약 line 343) 바로 뒤에 추가:

```ts
program
  .command('diff-cover')
  .alias('커버리지')
  .description('이번 변경(HEAD 대비)이 테스트로 커버됐는지 측정 (자문형·차단 없음)')
  .action(async () => { await diffCover() })
```

- [ ] **Step 8: 빌드 + 전체 게이트**

Run: `pnpm build; pnpm typecheck; pnpm lint; pnpm test:run`
Expected: 전부 통과, 회귀 0.

- [ ] **Step 9: 실제 CLI 스모크**

Run: `node dist/index.js diff-cover`
Expected: coverage 리포트 있으면 "변경 없음" 또는 미검증 변경분 보고. 리포트 없으면 "먼저 --coverage" 안내. (정상 동작 = exit 0/1 적절.)

- [ ] **Step 10: Commit**

```bash
git add src/commands/diff-cover.ts src/index.ts tests/diff-cover.test.ts
git commit -m "feat(goal-50): vhk diff-cover 자문 명령 — 미검증 변경분 보고(차단 0)"
```

---

## Task 7: 도그푸딩 실측 + Goal 50 카드 정합 + dev log

**Files:**
- Modify: `goals/50-coverage-diff-gate.md`
- Create: `docs/log/2026-06-XX-diff-coverage.md` (실제 날짜)

- [ ] **Step 1: 도그푸딩 측정 (코드 diff에)**

이 PR1의 src 변경 자체에 대해 `pnpm test:run --coverage; node dist/index.js diff-cover` 실행.
기록: 미검증 변경분 라인 수 / 추가 라인 수 / 비율. (RFC §5 PR2 결정 입력 — 단일 표본임을 명시, 며칠 누적 필요.)

- [ ] **Step 2: Goal 50 카드 정합 갱신**

`goals/50-coverage-diff-gate.md` Completion Check에서 `diff-coverage(신규분 차단) 도입` 항목 옆에 표기 추가:

```md
- [ ] diff-coverage(신규분 차단) 도입 — **PR1=측정(vhk diff-cover, 차단 0)**, 차단은 PR2(RFC 0050 §5 승격 시)
```

`status`는 PR1 머지 후 별도 판단(전 항목 충족 아니므로 IN_PROGRESS 유지).

- [ ] **Step 3: dev log 작성 (append-only)**

`docs/log/<날짜>-diff-coverage.md` 생성 — 한 일(PR1 모듈·명령), 실측치, RFC 0050 링크, PR2 결정 보류(표본 부족).

- [ ] **Step 4: Commit**

```bash
git add goals/50-coverage-diff-gate.md docs/log/*-diff-coverage.md
git commit -m "docs(goal-50): diff-cover 도그푸딩 실측 + 카드 정합 + dev log"
```

- [ ] **Step 5: PR 생성**

```bash
git push -u origin feat/diff-coverage
```
PR 본문은 Write로 임시 .md 작성 후 `gh pr create --body-file`(PS5.1 here-string 회피). CI green 확인 후 squash 머지.

---

## Self-Review (작성자 점검 — 완료)

**1. Spec coverage:** RFC §4 PR1 스코프 5항목 전부 매핑 — coverage 인프라(T1) · 순수 3모듈+git-session(T2~5) · diff-cover 자문(T6) · 도그푸딩(T7). §8 수용기준 5개 전부 태스크 존재(coverage 생성 T1S3 · 정확보고 T3~6 · 매칭0 경고 = coverage-parse null/diffCoverage inCoverage · 게이트 T6S8 · 실측 T7).
**2. Placeholder scan:** 모든 코드 스텝에 실제 코드. coverage-parse 첫 테스트의 호이스팅 지저분함은 정리본 명시.
**3. Type consistency:** `addedLinesByFile`/`coveredLinesByFile`/`diffCoverage`/`formatReport` 시그니처가 다이어그램·모듈·테스트·command에서 일관. `DiffCoverageResult`/`FileDiffCoverage` 필드(added/covered/uncoveredNew/ratio/inCoverage)가 T5 정의 ↔ T6 사용 일치.
**4. 경로 정규화 리스크:** RFC §7대로 `relative(cwd, abs)+toPosix`. 매칭 0건이면 `inCoverage:false`로 드러남(조용한 100% 아님). 윈도우 realpath 강화는 스모크(T6S9)에서 매칭 실패 관측 시 적용.
