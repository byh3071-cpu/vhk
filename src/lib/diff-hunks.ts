import { isFeatureSource, toPosix } from './test-mapping.js'

/**
 * `git diff --unified=0 HEAD` 텍스트 → 기능소스(src/commands·src/lib)별 추가 라인번호 집합. 순수 함수.
 * 헌트 헤더(@@ -a,b +c,d @@)만으로 추가 라인 계산(컨텍스트 0이라 본문 +라인 셀 필요 없음).
 * 파일 경계는 `diff --git` 에서 리셋, 대상은 `+++ b/<path>` 에서 확정(삭제=+++ /dev/null → 제외).
 */
export function addedLinesByFile(diffText: string): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>()
  let curFile: string | null = null
  for (const raw of diffText.split(/\r?\n/)) {
    if (raw.startsWith('diff --git ')) {
      curFile = null // 파일 경계 — binary/rename은 +++ 없음 → null 유지.
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
