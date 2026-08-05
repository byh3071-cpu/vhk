import {
  normalizeLegacyStatus,
  type GoalStatus,
  type ParsedGoal,
} from './goal-frontmatter.js'

export type GoalDependencyIssue =
  | { kind: 'invalid'; goalId: number; invalidTokens: string[] }
  | { kind: 'missing'; goalId: number; dependencyId: number }
  | { kind: 'self'; goalId: number }
  | { kind: 'cycle'; goalId: number; cycle: number[] }

export interface GoalDependencyAnalysis {
  dependencies: Map<number, number[]>
  waiting: Map<number, number[]>
  issues: GoalDependencyIssue[]
  invalidInProgress: Array<{ goalId: number; waitingFor: number[] }>
}

export function parseGoalDependencyIds(raw: string | number | undefined): {
  ids: number[]
  invalidTokens: string[]
} {
  if (raw === undefined) return { ids: [], invalidTokens: [] }
  const tokens = String(raw).split(',').map((token) => token.trim())
  const ids: number[] = []
  const invalidTokens: string[] = []
  const seen = new Set<number>()
  for (const token of tokens) {
    if (!/^\d+$/.test(token)) {
      invalidTokens.push(token)
      continue
    }
    const id = Number(token)
    if (!Number.isSafeInteger(id)) {
      invalidTokens.push(token)
      continue
    }
    if (!seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }
  return { ids, invalidTokens }
}

function statusOf(goal: ParsedGoal | undefined): GoalStatus | undefined {
  const raw = goal?.frontmatter.status
  if (typeof raw !== 'string') return undefined
  return normalizeLegacyStatus(raw) ?? undefined
}

function findCycles(dependencies: Map<number, number[]>, knownIds: Set<number>): GoalDependencyIssue[] {
  const visitState = new Map<number, 'visiting' | 'done'>()
  const stack: number[] = []
  const seenCycles = new Set<string>()
  const issues: GoalDependencyIssue[] = []

  const visit = (id: number): void => {
    visitState.set(id, 'visiting')
    stack.push(id)
    for (const dependencyId of dependencies.get(id) ?? []) {
      if (!knownIds.has(dependencyId) || dependencyId === id) continue
      const state = visitState.get(dependencyId)
      if (state === undefined) {
        visit(dependencyId)
        continue
      }
      if (state === 'visiting') {
        const start = stack.indexOf(dependencyId)
        const cycle = [...stack.slice(start), dependencyId]
        const key = [...new Set(cycle)].sort((a, b) => a - b).join(',')
        if (!seenCycles.has(key)) {
          seenCycles.add(key)
          issues.push({ kind: 'cycle', goalId: cycle[0], cycle })
        }
      }
    }
    stack.pop()
    visitState.set(id, 'done')
  }

  for (const id of [...knownIds].sort((a, b) => a - b)) {
    if (visitState.get(id) === undefined) visit(id)
  }
  return issues
}

export function analyzeGoalDependencies(goals: ParsedGoal[]): GoalDependencyAnalysis {
  const sorted = goals
    .filter((goal) => typeof goal.frontmatter.id === 'number')
    .sort((a, b) => (a.frontmatter.id as number) - (b.frontmatter.id as number))
  const byId = new Map<number, ParsedGoal>()
  for (const goal of sorted) byId.set(goal.frontmatter.id as number, goal)

  const dependencies = new Map<number, number[]>()
  const issues: GoalDependencyIssue[] = []
  for (const goal of sorted) {
    const goalId = goal.frontmatter.id as number
    const parsed = parseGoalDependencyIds(goal.frontmatter.depends_on)
    dependencies.set(goalId, parsed.ids)
    if (parsed.invalidTokens.length > 0) {
      issues.push({ kind: 'invalid', goalId, invalidTokens: parsed.invalidTokens })
    }
    for (const dependencyId of parsed.ids) {
      if (dependencyId === goalId) issues.push({ kind: 'self', goalId })
      else if (!byId.has(dependencyId)) issues.push({ kind: 'missing', goalId, dependencyId })
    }
  }
  issues.push(...findCycles(dependencies, new Set(byId.keys())))

  const waiting = new Map<number, number[]>()
  const invalidInProgress: Array<{ goalId: number; waitingFor: number[] }> = []
  for (const goal of sorted) {
    const goalId = goal.frontmatter.id as number
    const waitingFor = (dependencies.get(goalId) ?? [])
      .filter((dependencyId) => statusOf(byId.get(dependencyId)) !== 'DONE')
    waiting.set(goalId, waitingFor)
    if (statusOf(goal) === 'IN_PROGRESS' && waitingFor.length > 0) {
      invalidInProgress.push({ goalId, waitingFor })
    }
  }

  return { dependencies, waiting, issues, invalidInProgress }
}

export function dependencyIssuesForGoal(
  goalId: number,
  analysis: GoalDependencyAnalysis,
): GoalDependencyIssue[] {
  const related = new Set<number>()
  const visit = (id: number): void => {
    if (related.has(id)) return
    related.add(id)
    for (const dependencyId of analysis.dependencies.get(id) ?? []) visit(dependencyId)
  }
  visit(goalId)
  return analysis.issues.filter((issue) => {
    if (related.has(issue.goalId)) return true
    return issue.kind === 'cycle' && issue.cycle.some((id) => related.has(id))
  })
}
