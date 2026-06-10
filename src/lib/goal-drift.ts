import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { listGoals, type GoalStatus } from './goal-frontmatter.js'

// Goal 43: goal 상태 ↔ 코드 현실 드리프트 게이트.
//
// 불변 규칙: "goal 고유 게이트 검증(custom must() 호출)이 있는 goal 은 status: NOT_STARTED 이면 안 된다."
//   근거: check-goal-<id>.mjs 는 `vhk goal sync` 가 백필하는데, 스캐폴드 상태에는 must() **정의**와
//         **주석 처리된 예시**만 있다. 실제 must() **호출**은 그 goal 을 구현하면서 손으로 추가한다.
//         즉 custom must() = "코드 구현 흔적". 그게 있는데 status 가 NOT_STARTED 면 드리프트.
//   실측: Goal 19(pattern)가 src/commands/pattern.ts 풀구현 + v2.1.0 출시인데 status: NOT_STARTED 로
//         남아 이 규칙을 위반했다(이 게이트가 막으려는 원형 사례).
//
// 보수적 설계(거짓 양성보다 미탐 선호):
//   - NOT_STARTED 만 본다. IN_PROGRESS/DONE/BLOCKED 는 대상 아님.
//   - 게이트 스크립트가 없으면(예: 아직 sync 안 한 SEO goal 21~26) 후보 아님.
//   - 스캐폴드(정의/주석만)면 후보 아님 → 새 goal 무더기 오탐 0.

/**
 * check-goal 스크립트 본문에 goal 고유 검증(custom `must()` 호출)이 있는지.
 * - 주석(`//`) 라인 무시.
 * - `const must = ...` **정의** 라인 제외(호출이 아님).
 * - 그 외 라인에 `must(` 가 있으면 = goal 고유 assertion = 구현 흔적.
 */
export function hasCustomGateAssertions(scriptContent: string): boolean {
  for (const raw of scriptContent.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('//')) continue
    if (/const\s+must\s*=/.test(line)) continue // must 헬퍼 정의 라인 — 호출 아님
    if (line.includes('must(')) return true // goal 고유 검증 호출 발견
  }
  return false
}

// Goal 53: 가드 신뢰도 — 정규식 shape 단언 측정.
//   `must(/.../.test(src), ...)` 형태는 함수명만 바꿔도 깨지고(거짓음성), import 만 해두면 통과(거짓양성).
//   비율을 측정해 상한(ratchet)으로 묶고, 핵심 행동은 behavior 테스트(tests/*.test.ts)로 검증한다.
const REGEX_SHAPE_ASSERTION = /must\([^)]*\/.*\/\.test/

/**
 * check-goal 본문에서 정규식 shape 단언(`must(/.../.test(...))`)의 개수와 예시(최대 5).
 * 주석(`//`)·헬퍼 정의(`const must =`) 라인은 제외.
 */
export function countRegexAssertions(content: string): { count: number; examples: string[] } {
  const examples: string[] = []
  let count = 0
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('//')) continue
    if (/const\s+must\s*=/.test(line)) continue
    if (!line.includes('must(')) continue
    if (REGEX_SHAPE_ASSERTION.test(line)) {
      count++
      if (examples.length < 5) examples.push(line.slice(0, 100))
    }
  }
  return { count, examples }
}

/**
 * check-goal 본문의 전체 `must()` 호출 수(정규식 비율의 분모).
 * 주석·헬퍼 정의 라인 제외 — countRegexAssertions 와 동일 기준.
 */
export function countMustAssertions(content: string): number {
  let count = 0
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('//')) continue
    if (/const\s+must\s*=/.test(line)) continue
    if (line.includes('must(')) count++
  }
  return count
}

export interface DriftCandidate {
  id: number
  title: string
  status: GoalStatus
  goalFile: string
  scriptFile: string
  reason: string
}

/**
 * goals/ ↔ scripts/ 를 대조해 "shipped 인데 NOT_STARTED" 드리프트 후보를 찾는다(순수, fs 읽기만).
 * 판정: status === NOT_STARTED 이고 check-goal-<id>.mjs 가 존재하며 custom must() 호출이 있는 goal.
 */
export function findStatusDriftCandidates(goalsDir: string, scriptsDir: string): DriftCandidate[] {
  const out: DriftCandidate[] = []
  for (const g of listGoals(goalsDir)) {
    const status = (g.frontmatter.status ?? 'NOT_STARTED')
    if (status !== 'NOT_STARTED') continue
    const id = g.frontmatter.id
    if (typeof id !== 'number') continue
    const scriptFile = join(scriptsDir, `check-goal-${id}.mjs`)
    if (!existsSync(scriptFile)) continue
    let content: string
    try {
      content = readFileSync(scriptFile, 'utf-8')
    } catch {
      continue
    }
    if (!hasCustomGateAssertions(content)) continue
    out.push({
      id,
      title: g.frontmatter.title ?? '',
      status,
      goalFile: g.filePath,
      scriptFile,
      reason:
        'status: NOT_STARTED 인데 check-goal 게이트에 goal 고유 검증(코드 구현 흔적)이 있음 — 구현됐는데 status 만 안 바뀐 드리프트 의심',
    })
  }
  return out
}
