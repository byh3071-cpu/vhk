import type { GoalStatus } from './goal-frontmatter.js'
import { SECRET_PATTERNS } from './secret-patterns.js'

export type GoalTaskSourceStatus = 'pending' | 'completed' | 'notApplicable'
export type GoalTaskReadiness = 'ready' | 'waiting' | 'terminal'

export type WorkContextDiagnosticCode =
  | 'NO_ACTIVE_GOAL'
  | 'NO_PHASES'
  | 'MISSING_GOAL_TITLE'
  | 'UNKNOWN_GOAL_STATUS'
  | 'INVALID_PHASE_SYNTAX'
  | 'INVALID_PHASE_ID'
  | 'DUPLICATE_PHASE_ID'
  | 'OUT_OF_ORDER_PHASE_ID'
  | 'EMPTY_PHASE'
  | 'TASK_WITHOUT_PHASE'
  | 'INVALID_TASK_SYNTAX'
  | 'INVALID_TASK_ID'
  | 'DUPLICATE_TASK_ID'
  | 'OUT_OF_ORDER_TASK_ID'
  | 'CHECKED_NOT_APPLICABLE_TASK'
  | 'INVALID_EVIDENCE_HINT'
  | 'UNCLOSED_CODE_FENCE'
  | 'INCOMPATIBLE_FLAGS'
  | 'PUBLIC_BOUNDARY_VIOLATION'
  | 'GOAL_READ_FAILED'

export interface WorkContextDiagnostic {
  code: WorkContextDiagnosticCode
  sourceLine?: number
}

export interface WorkContextPhaseV1 {
  id: string
}

export interface WorkContextTaskV1 {
  id: string
  phaseId: string
  sourceStatus: GoalTaskSourceStatus
  readiness: GoalTaskReadiness
  dependsOn: string[]
  evidenceHint: string | null
  sourceRef: string
  sourceLine: number
}

export interface WorkContextActiveGoalV1 {
  id: string
  title: string | null
  sourceStatus: GoalStatus | null
  phases: WorkContextPhaseV1[]
  tasks: WorkContextTaskV1[]
}

export interface WorkContextV1 {
  schemaVersion: 1
  valid: boolean
  activeGoal: WorkContextActiveGoalV1 | null
  warnings: WorkContextDiagnostic[]
  errors: WorkContextDiagnostic[]
}

export interface GoalTaskProjectionInput {
  goalId: number
  goalTitle: string | null
  goalStatus: GoalStatus | null
  sourceRef: string
  markdown: string
}

interface ParsedTask {
  number: number
  sourceStatus: GoalTaskSourceStatus
  evidenceHint: string | null
  sourceLine: number
}

interface ParsedPhase {
  number: number
  sourceLine: number
  tasks: ParsedTask[]
}

const PHASE_LINE = /^### Phase (\S+)$/u
const PHASE_SHAPE = /^\s*#{1,6}\s*(?:\*{1,2})?phase\b/iu
const TASK_LINE = /^- \[([ xX])\] \*\*Task (\S+)\*\*(?: (.*))?$/u
const TASK_SHAPE = /^\s*-\s*\[[^\]]*\]\s*\*\*(?:task\b|[+-]?(?:\d|0x))/iu
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/u
const EMAIL_PATTERN = /\b[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+\b/giu
const UUID_PATTERN = /(?<![0-9a-f])[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}(?![0-9a-f])/giu
const ZERO_UUID = /^0{32}$/u
const HOME_PATH_PATTERN = /(?:[a-z]:[\\/](?:users|documents and settings)[\\/][^\\/\r\n]+(?:[\\/]|$)|\/(?:home|users)\/[^/\r\n]+(?:\/|$)|\/root(?:\/|$))/iu
const CANONICAL_POSITIVE_INTEGER = /^[1-9][0-9]*$/u
const NOT_APPLICABLE_MARKER = '`(na)`'
const EVIDENCE_SEPARATORS = [' / 증거:', ' / evidence:'] as const

function errorResult(code: WorkContextDiagnosticCode): WorkContextV1 {
  return {
    schemaVersion: 1,
    valid: false,
    activeGoal: null,
    warnings: [],
    errors: [{ code }],
  }
}

function isSafeSourceRef(sourceRef: string): boolean {
  if (!sourceRef || sourceRef.includes('\\') || /[:\u0000-\u001f]/u.test(sourceRef)) return false
  if (sourceRef.startsWith('/') || /^[a-z]:/iu.test(sourceRef)) return false
  const segments = sourceRef.split('/')
  const normalizedSegments = segments.map((segment) => segment.toLowerCase())
  if (normalizedSegments[0] === 'goals') return false
  if (normalizedSegments[0] === 'docs' && normalizedSegments[1] === 'state') return false
  return segments.every(
    (segment) => segment !== '' && segment !== '.' && segment !== '..' && segment !== '.vhk',
  )
}

function isAllowedEmail(email: string): boolean {
  const normalized = email.toLowerCase()
  return (
    normalized === 'opensource@yohanstudio.co' ||
    normalized === 'noreply@github.com' ||
    normalized.endsWith('@users.noreply.github.com') ||
    /@example\.(?:com|net|org)$/u.test(normalized)
  )
}

function hasUnsafeText(text: string): boolean {
  if (HOME_PATH_PATTERN.test(text)) return true

  for (const match of text.matchAll(EMAIL_PATTERN)) {
    if (!isAllowedEmail(match[0])) return true
  }

  for (const match of text.matchAll(UUID_PATTERN)) {
    const compact = match[0].replaceAll('-', '').toLowerCase()
    if (!ZERO_UUID.test(compact)) return true
  }

  for (const pattern of SECRET_PATTERNS) {
    const flags = pattern.pattern.flags.includes('g')
      ? pattern.pattern.flags
      : `${pattern.pattern.flags}g`
    const regex = new RegExp(pattern.pattern.source, flags)
    if (regex.test(text)) return true
  }
  return false
}

function violatesPublicBoundary(input: GoalTaskProjectionInput): boolean {
  if (!isSafeSourceRef(input.sourceRef)) return true
  return [input.goalTitle ?? '', input.sourceRef, input.markdown].some(hasUnsafeText)
}

function closingFencePattern(marker: string): RegExp {
  const char = marker[0]
  return new RegExp(`^ {0,3}${char}{${marker.length},}[ \\t]*$`, 'u')
}

function evidenceFrom(description: string): {
  description: string
  evidenceHint: string | null
  invalid: boolean
} {
  let separatorIndex = -1
  let separator = ''
  for (const candidate of EVIDENCE_SEPARATORS) {
    const index = description.indexOf(candidate)
    if (index >= 0 && (separatorIndex < 0 || index < separatorIndex)) {
      separatorIndex = index
      separator = candidate
    }
  }
  if (separatorIndex < 0) {
    return { description: description.trim(), evidenceHint: null, invalid: false }
  }
  const evidenceHint = description.slice(separatorIndex + separator.length).trim()
  return {
    description: description.slice(0, separatorIndex).trim(),
    evidenceHint: evidenceHint || null,
    invalid: evidenceHint.length === 0,
  }
}

function toActiveGoal(
  input: GoalTaskProjectionInput,
  phases: ParsedPhase[],
): WorkContextActiveGoalV1 {
  const goalId = `goal:${input.goalId}`
  const tasks: WorkContextTaskV1[] = []

  for (const [phaseIndex, phase] of phases.entries()) {
    const phaseId = `${goalId}/phase:${phase.number}`
    const previousTasks = phaseIndex === 0 ? [] : phases[phaseIndex - 1].tasks
    const dependsOn = previousTasks.map((task) => `${goalId}/task:${task.number}`)
    const previousPhaseTerminal = previousTasks.every(
      (task) => task.sourceStatus === 'completed' || task.sourceStatus === 'notApplicable',
    )

    for (const task of phase.tasks) {
      const terminal = task.sourceStatus !== 'pending'
      tasks.push({
        id: `${goalId}/task:${task.number}`,
        phaseId,
        sourceStatus: task.sourceStatus,
        readiness: terminal
          ? 'terminal'
          : phaseIndex === 0 || previousPhaseTerminal
            ? 'ready'
            : 'waiting',
        dependsOn: [...dependsOn],
        evidenceHint: task.evidenceHint,
        sourceRef: input.sourceRef,
        sourceLine: task.sourceLine,
      })
    }
  }

  return {
    id: goalId,
    title: input.goalTitle?.trim() || null,
    sourceStatus: input.goalStatus,
    phases: phases.map((phase) => ({ id: `${goalId}/phase:${phase.number}` })),
    tasks,
  }
}

export function parseGoalPhaseTasks(input: GoalTaskProjectionInput): WorkContextV1 {
  if (violatesPublicBoundary(input)) return errorResult('PUBLIC_BOUNDARY_VIOLATION')
  if (!Number.isSafeInteger(input.goalId) || input.goalId < 0) return errorResult('GOAL_READ_FAILED')

  const warnings: WorkContextDiagnostic[] = []
  if (!input.goalTitle?.trim()) warnings.push({ code: 'MISSING_GOAL_TITLE' })
  if (input.goalStatus === null) warnings.push({ code: 'UNKNOWN_GOAL_STATUS' })

  const errors: WorkContextDiagnostic[] = []
  const diagnosticKeys = new Set<string>()
  const addError = (code: WorkContextDiagnosticCode, sourceLine?: number): void => {
    const key = `${code}:${sourceLine ?? ''}`
    if (diagnosticKeys.has(key)) return
    diagnosticKeys.add(key)
    errors.push(sourceLine === undefined ? { code } : { code, sourceLine })
  }

  const lines = input.markdown.replace(/^\uFEFF/u, '').split(/\r?\n/u)
  const phases: ParsedPhase[] = []
  const phaseNumbers = new Set<number>()
  const taskNumbers = new Set<number>()
  let currentPhase: ParsedPhase | null = null
  let lastPhaseNumber: number | null = null
  let lastTaskNumber: number | null = null
  let fence: { marker: string; sourceLine: number } | null = null

  const closeEmptyPhase = (): void => {
    if (currentPhase && currentPhase.tasks.length === 0) {
      addError('EMPTY_PHASE', currentPhase.sourceLine)
    }
  }

  /*
   * Phase/Task처럼 보이는 예제를 먼저 fence 상태로 걷어낸다. closing marker는 opening과
   * 같은 문자이면서 길이가 같거나 길어야 하므로 단순 boolean 토글로 처리할 수 없다.
   */
  for (const [index, line] of lines.entries()) {
    const sourceLine = index + 1
    if (fence) {
      if (closingFencePattern(fence.marker).test(line)) fence = null
      continue
    }

    const opening = line.match(FENCE_OPEN)
    if (opening && !(opening[1][0] === '`' && opening[2].includes('`'))) {
      fence = { marker: opening[1], sourceLine }
      continue
    }

    const phaseMatch = line.match(PHASE_LINE)
    if (phaseMatch) {
      closeEmptyPhase()
      const phaseId = phaseMatch[1]
      const phaseNumber = Number(phaseId)
      const validPhaseNumber =
        CANONICAL_POSITIVE_INTEGER.test(phaseId) && Number.isSafeInteger(phaseNumber)
      if (!validPhaseNumber) {
        addError('INVALID_PHASE_ID', sourceLine)
      } else if (phaseNumbers.has(phaseNumber)) {
        addError('DUPLICATE_PHASE_ID', sourceLine)
      } else if (lastPhaseNumber !== null && phaseNumber < lastPhaseNumber) {
        addError('OUT_OF_ORDER_PHASE_ID', sourceLine)
      }
      if (validPhaseNumber) {
        phaseNumbers.add(phaseNumber)
        lastPhaseNumber = phaseNumber
      }
      currentPhase = { number: phaseNumber, sourceLine, tasks: [] }
      phases.push(currentPhase)
      continue
    }
    if (PHASE_SHAPE.test(line)) {
      addError('INVALID_PHASE_SYNTAX', sourceLine)
      continue
    }

    const taskMatch = line.match(TASK_LINE)
    if (!taskMatch) {
      if (TASK_SHAPE.test(line)) addError('INVALID_TASK_SYNTAX', sourceLine)
      continue
    }
    if (!currentPhase) {
      addError('TASK_WITHOUT_PHASE', sourceLine)
      continue
    }

    const taskId = taskMatch[2]
    const taskNumber = Number(taskId)
    const validTaskNumber =
      CANONICAL_POSITIVE_INTEGER.test(taskId) && Number.isSafeInteger(taskNumber)
    if (!validTaskNumber) {
      addError('INVALID_TASK_ID', sourceLine)
    } else if (taskNumbers.has(taskNumber)) {
      addError('DUPLICATE_TASK_ID', sourceLine)
    } else if (lastTaskNumber !== null && taskNumber < lastTaskNumber) {
      addError('OUT_OF_ORDER_TASK_ID', sourceLine)
    }
    if (validTaskNumber) {
      taskNumbers.add(taskNumber)
      lastTaskNumber = taskNumber
    }

    const checked = taskMatch[1] !== ' '
    const remainder = (taskMatch[3] ?? '').trim()
    const notApplicable =
      remainder === NOT_APPLICABLE_MARKER || remainder.startsWith(`${NOT_APPLICABLE_MARKER} `)
    if (checked && notApplicable) addError('CHECKED_NOT_APPLICABLE_TASK', sourceLine)

    const evidenceSource = notApplicable
      ? remainder.slice(NOT_APPLICABLE_MARKER.length)
      : remainder
    const evidence = evidenceFrom(evidenceSource)
    if (evidence.invalid) addError('INVALID_EVIDENCE_HINT', sourceLine)
    if (!notApplicable && evidence.description.length === 0) {
      addError('INVALID_TASK_SYNTAX', sourceLine)
    }

    currentPhase.tasks.push({
      number: taskNumber,
      sourceStatus: notApplicable ? 'notApplicable' : checked ? 'completed' : 'pending',
      evidenceHint: evidence.evidenceHint,
      sourceLine,
    })
  }

  closeEmptyPhase()
  if (fence) addError('UNCLOSED_CODE_FENCE', fence.sourceLine)

  if (errors.length > 0) {
    return { schemaVersion: 1, valid: false, activeGoal: null, warnings: [], errors }
  }

  if (phases.length === 0) warnings.push({ code: 'NO_PHASES' })
  return {
    schemaVersion: 1,
    valid: true,
    activeGoal: toActiveGoal(input, phases),
    warnings,
    errors: [],
  }
}
