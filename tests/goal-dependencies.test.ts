import { describe, expect, it } from 'vitest'
import type { ParsedGoal } from '../src/lib/goal-frontmatter.js'
import {
  analyzeGoalDependencies,
  dependencyIssuesForGoal,
  parseGoalDependencyIds,
} from '../src/lib/goal-dependencies.js'

function goal(id: number, status: ParsedGoal['frontmatter']['status'], dependsOn?: string): ParsedGoal {
  return {
    filePath: `goals/${id}-test.md`,
    frontmatter: { type: 'goal', id, status, ...(dependsOn === undefined ? {} : { depends_on: dependsOn }) },
    body: '',
  }
}

describe('Goal depends_on 파싱', () => {
  it('필드 없음은 의존성 없음으로 기존 동작을 보존한다', () => {
    expect(parseGoalDependencyIds(undefined)).toEqual({ ids: [], invalidTokens: [] })
  })

  it('공백을 허용하고 중복 ID를 첫 순서대로 한 번만 남긴다', () => {
    expect(parseGoalDependencyIds('110, 111,110')).toEqual({ ids: [110, 111], invalidTokens: [] })
  })

  it('빈 토큰·음수·소수·문자를 잘못된 값으로 돌려준다', () => {
    expect(parseGoalDependencyIds('110,, -1, 1.5, abc')).toEqual({
      ids: [110],
      invalidTokens: ['', '-1', '1.5', 'abc'],
    })
  })
})

describe('Goal 의존성 분석', () => {
  it('DONE만 충족으로 보고 나머지 상태는 대기로 남긴다', () => {
    const analysis = analyzeGoalDependencies([
      goal(1, 'DONE'),
      goal(2, 'DEFERRED'),
      goal(3, 'NOT_STARTED', '1,2'),
    ])
    expect(analysis.issues).toEqual([])
    expect(analysis.waiting.get(3)).toEqual([2])
  })

  it('존재하지 않는 ID와 자기 참조를 설정 오류로 찾는다', () => {
    const analysis = analyzeGoalDependencies([
      goal(1, 'NOT_STARTED', '1'),
      goal(2, 'NOT_STARTED', '99'),
    ])
    expect(analysis.issues.map((issue) => issue.kind)).toEqual(['self', 'missing'])
  })

  it('직접·간접 순환을 한 사이클 오류로 찾는다', () => {
    const goals = [
      goal(1, 'NOT_STARTED', '2'),
      goal(2, 'NOT_STARTED', '3'),
      goal(3, 'NOT_STARTED', '1'),
    ]
    const analysis = analyzeGoalDependencies(goals)
    expect(analysis.issues).toHaveLength(1)
    expect(analysis.issues[0]).toMatchObject({ kind: 'cycle' })
    expect(dependencyIssuesForGoal(1, analysis)).toHaveLength(1)
  })

  it('미완료 선행 작업을 가진 IN_PROGRESS를 별도 오류로 찾는다', () => {
    const analysis = analyzeGoalDependencies([
      goal(1, 'NOT_STARTED'),
      goal(2, 'IN_PROGRESS', '1'),
    ])
    expect(analysis.invalidInProgress).toEqual([{ goalId: 2, waitingFor: [1] }])
  })

  it('중복 Goal ID는 다른 goal 명령과 같이 첫 카드를 기준으로 분석한다', () => {
    const analysis = analyzeGoalDependencies([
      goal(1, 'DONE'),
      { ...goal(1, 'NOT_STARTED', '99'), filePath: 'goals/1-duplicate.md' },
      goal(2, 'NOT_STARTED', '1'),
    ])

    expect(analysis.dependencies.get(1)).toEqual([])
    expect(analysis.waiting.get(2)).toEqual([])
    expect(analysis.issues).toEqual([])
  })
})
