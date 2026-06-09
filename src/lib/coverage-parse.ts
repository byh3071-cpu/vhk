import { existsSync } from 'node:fs'
import { relative } from 'node:path'
import { isFeatureSource, toPosix } from './test-mapping.js'
import { readJsonFile } from './read-json.js'

interface V8FileCov {
  path?: string
  statementMap?: Record<string, { start: { line: number }; end: { line: number } }>
  s?: Record<string, number>
}

/**
 * v8 coverage-final.json → 기능소스(src/commands·src/lib)별 "실행된(커버된)" 라인 집합.
 * - 리포트 파일 부재/손상 → null (측정 불가 — diff-cover 가 "먼저 --coverage" 안내).
 * - 리포트 존재 but 특정 파일 부재 → 그 파일은 맵에 없음(= 테스트가 import 안 함 → 전 라인 미커버로 처리됨).
 * 경로: 절대경로 키 → cwd 상대 posix 정규화(git rel posix 와 매칭).
 */
export function coveredLinesByFile(
  jsonPath: string,
  cwd: string = process.cwd()
): Map<string, Set<number>> | null {
  if (!existsSync(jsonPath)) return null
  let data: Record<string, V8FileCov>
  try {
    // 프로젝트 단일 JSON 통로(BOM 처리 + raw JSON.parse 가드 회피).
    data = readJsonFile<Record<string, V8FileCov>>(jsonPath)
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
