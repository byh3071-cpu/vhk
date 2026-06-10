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

  it('기능소스 아닌 파일(문서·테스트)은 무시', () => {
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

  // 적대 검증 발견(2026-06-10): 헌트 본문의 +++/--- 내용라인을 파일 헤더로 오인 →
  // 같은 파일 후속 헌트 누락. 상태머신(첫 @@ 이후 본문)으로 차단.
  it('헌트 본문 +++ 내용라인(소스 "++ x") 뒤 후속 헌트 유지', () => {
    const diff = [
      'diff --git a/src/lib/a.ts b/src/lib/a.ts',
      '--- a/src/lib/a.ts',
      '+++ b/src/lib/a.ts',
      '@@ -5,0 +6,1 @@',
      '+++ x', // 소스 "++ x" 추가 → diff 본문(헤더 아님)
      '@@ -20,0 +30,2 @@', // 같은 파일 두 번째 헌트
      '+y',
      '+z',
    ].join('\n')
    expect([...(addedLinesByFile(diff).get('src/lib/a.ts') ?? [])]).toEqual([6, 30, 31])
  })

  it('헌트 본문 --- 내용라인(소스 "-- y")도 헤더 오인 안 함', () => {
    const diff = [
      'diff --git a/src/lib/a.ts b/src/lib/a.ts',
      '--- a/src/lib/a.ts',
      '+++ b/src/lib/a.ts',
      '@@ -5,1 +6,1 @@',
      '--- y',
      '+++ x',
      '@@ -20,0 +30,1 @@',
      '+z',
    ].join('\n')
    expect([...(addedLinesByFile(diff).get('src/lib/a.ts') ?? [])]).toEqual([6, 30])
  })
})
