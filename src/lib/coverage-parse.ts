import { existsSync } from 'node:fs'
import { relative } from 'node:path'
import { isFeatureSource, toPosix } from './test-mapping.js'
import { readJsonFile } from './read-json.js'

interface V8FileCov {
  path?: string
  statementMap?: Record<string, { start: { line: number }; end: { line: number } }>
  s?: Record<string, number>
}

export interface FileCoverage {
  /** s[k]>0 인 statement 의 라인 — 실제 실행된 라인. */
  covered: Set<number>
  /** statementMap 의 모든 라인 — 실행가능(코드) 라인. import/주석/타입/빈줄/중괄호는 제외(노이즈 차단). */
  executable: Set<number>
}

// #319/#321 의 #321: 리포트 파일이 *실재하나* JSON.parse 실패(잘림/빈 파일)인 손상 상태를
// 부재(null)와 구분하는 sentinel. 호출부가 '리포트 없음(새로 생성)' 대신 '리포트 손상(재생성)'으로
// 정직 보고하게 한다(은폐 차단). null=부재, COVERAGE_CORRUPT=손상, Map=정상.
export const COVERAGE_CORRUPT = Symbol('coverage-corrupt')
export type CoverageResult = Map<string, FileCoverage> | null | typeof COVERAGE_CORRUPT

/**
 * v8 coverage-final.json → 기능소스(src/commands·src/lib)별 {커버된 라인, 실행가능 라인}.
 * - 리포트 파일 부재 → null (측정 불가 — diff-cover 가 "먼저 --coverage" 안내).
 * - 리포트 파일 실재 but JSON.parse 실패(잘림/빈 파일) → COVERAGE_CORRUPT (#321 — 부재와 구분해
 *   '리포트 손상(재생성)'으로 정직 보고하게 함. 과거엔 둘 다 null 로 붕괴해 손상을 '없음'으로 은폐).
 * - 리포트 존재 but 특정 파일 부재 → 맵에 없음(= 테스트가 import 안 함 → diff-coverage 가 coarse 처리).
 * executable 을 따로 노출하는 이유: "미검증 변경분"은 *실행가능* 추가라인 중 미커버만 세야 한다.
 * 비실행 라인(import·주석·타입·중괄호)까지 세면 false-completion 신호가 노이즈에 묻힘(도그푸딩이 잡은 결함).
 * 경로: 절대경로 키 → cwd 상대 posix 정규화(git rel posix 와 매칭).
 */
export function fileCoverageByFile(
  jsonPath: string,
  cwd: string = process.cwd()
): CoverageResult {
  if (!existsSync(jsonPath)) return null
  let data: Record<string, V8FileCov>
  try {
    // 프로젝트 단일 JSON 통로(BOM 처리 + raw JSON.parse 가드 회피).
    data = readJsonFile<Record<string, V8FileCov>>(jsonPath)
  } catch {
    return COVERAGE_CORRUPT // #321: 파일 실재 but 파싱 실패 = 손상(부재 null 과 구분).
  }
  const out = new Map<string, FileCoverage>()
  for (const [absKey, cov] of Object.entries(data)) {
    const rel = toPosix(relative(cwd, cov.path ?? absKey))
    if (!isFeatureSource(rel)) continue
    const covered = new Set<number>()
    const executable = new Set<number>()
    const sMap = cov.statementMap ?? {}
    const counts = cov.s ?? {}
    for (const [k, stmt] of Object.entries(sMap)) {
      const hit = (counts[k] ?? 0) > 0
      for (let l = stmt.start.line; l <= stmt.end.line; l++) {
        executable.add(l)
        if (hit) covered.add(l)
      }
    }
    out.set(rel, { covered, executable })
  }
  return out
}
