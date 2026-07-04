import { existsSync } from 'node:fs'
import { relative } from 'node:path'
import { isFeatureSource, toPosix } from './test-mapping.js'
import { readJsonFile } from './read-json.js'

/** branch location — 암묵 else 등 line 정보가 없는 경우 있음(istanbul 흔한 케이스). */
interface V8BranchLocation {
  start?: { line?: number }
  end?: { line?: number }
}

interface V8Branch {
  /** 분기 자체(if 문 등)의 위치 — location 에 line 이 없을 때 폴백용. */
  loc?: V8BranchLocation
  locations?: V8BranchLocation[]
}

interface V8FileCov {
  path?: string
  statementMap?: Record<string, { start: { line: number }; end: { line: number } }>
  s?: Record<string, number>
  branchMap?: Record<string, V8Branch>
  b?: Record<string, number[]>
}

export interface FileCoverage {
  /** s[k]>0 인 statement 의 라인 — 실제 실행된 라인. */
  covered: Set<number>
  /** statementMap 의 모든 라인 — 실행가능(코드) 라인. import/주석/타입/빈줄/중괄호는 제외(노이즈 차단). */
  executable: Set<number>
  /**
   * #375: branchMap/b 기준 — 분기(if/삼항/switch 등)의 location 중 하나라도 hits===0 인 라인.
   * 단일줄 if(예: "if (x) return 'a'")는 whole-statement 가 hit 되면 s 상 covered 로 오판정되지만,
   * true/false(암묵 else 포함) 중 하나가 안 밟히면 여기 잡힌다 — statement 커버와 독립된 신호.
   * required(항상 채움) — branchMap 이 없는 파일도 빈 Set 으로 정직 반환(크래시·undefined 전파 방지).
   */
  branchPartial: Set<number>
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

    // #375: branchMap/b — 각 branch 의 locations[i] 중 hits[i]===0 인 것의 라인을 branchPartial 에 추가.
    // location 에 line 정보가 없으면(암묵 else) branch 자체의 loc.start.line 으로 폴백.
    const branchPartial = new Set<number>()
    const branchMap = cov.branchMap ?? {}
    const branchHits = cov.b ?? {}
    for (const [k, branch] of Object.entries(branchMap)) {
      const hits = branchHits[k] ?? []
      const locations = branch.locations ?? []
      locations.forEach((loc, i) => {
        if ((hits[i] ?? 0) > 0) return // 이 location 은 실행됨
        const line = loc.start?.line ?? branch.loc?.start?.line
        if (typeof line === 'number') branchPartial.add(line)
      })
    }

    out.set(rel, { covered, executable, branchPartial })
  }
  return out
}
