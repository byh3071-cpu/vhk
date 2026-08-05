import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'
import { ko } from '../i18n/ko.js'
import { localDate } from '../lib/date.js'
import { printNextStep } from '../lib/next-step.js'
import { safeExecFile } from '../lib/exec.js'
import { ensureNotHardStopped } from '../lib/hard-stop-guard.js'
import { atomicWriteFile } from '../lib/atomic-write.js'
import { saveBackup, pruneBackups } from '../lib/backup.js'
import {
  listGoals,
  findDuplicateIds,
  findSkippedGoalFiles,
  updateFrontmatterStatus,
  planGoalFileMigrate,
  normalizeLegacyStatus,
  GOAL_STATUSES,
  type GoalStatus,
  type ParsedGoal,
} from '../lib/goal-frontmatter.js'
import { findStatusDriftCandidates } from '../lib/goal-drift.js'
import {
  analyzeGoalDependencies,
  dependencyIssuesForGoal,
  type GoalDependencyAnalysis,
  type GoalDependencyIssue,
} from '../lib/goal-dependencies.js'

const GOALS_DIR = 'goals'
const STATE_DIR = 'docs/state'
const SCRIPTS_DIR = 'scripts'

const STATUS_ICON: Record<GoalStatus, string> = {
  NOT_STARTED: '⚪',
  IN_PROGRESS: '🟡',
  DONE: '✅',
  BLOCKED: '🛑',
  CANCELED: '⛔',
  DEFERRED: '⏸',
  OBSERVING: '👁',
}

function effectiveGoalStatus(fm: ParsedGoal['frontmatter']): GoalStatus | undefined {
  const raw = fm.status
  if (raw == null) return undefined
  const s = String(raw)
  return normalizeLegacyStatus(s) ?? (GOAL_STATUSES.includes(s as GoalStatus) ? (s as GoalStatus) : undefined)
}

// #329: --id 없이 active goal 이 null 일 때, goalNext(VHK-017)와 동일하게 0개/전부완료를 구분 안내.
//        이전엔 둘 다 generic '대상 결정 불가'(exit 1)로 뭉개 '설정 오류'처럼 오해를 줬다.
//        0개·전부완료는 정상 상태 → 안내만 하고 exit 0. (true 반환 = 정상 종료 신호)
function reportNoActiveGoal(goals: ParsedGoal[]): boolean {
  if (goals.length === 0) {
    console.log(chalk.yellow('  📭 정의된 goal 이 없습니다.'))
    console.log(chalk.dim('  vhk goal init 으로 시작하세요.'))
    return true
  }
  console.log(chalk.green('  🎉 모든 goal 이 완료되었습니다 — 검사/완료할 대상이 없습니다.'))
  return true
}

// active goal 선택: id 오름차순 IN_PROGRESS 우선, 없으면 NOT_STARTED/legacy 상태 누락.
// (BLOCKED 는 자동 선택 안 함 — 사람이 풀어야 함.)
export function selectActiveId(goals: ParsedGoal[]): number | null {
  // why: 호출자가 파일·배열 순서를 바꿔도 같은 Goal을 골라야 RFC 0064의 결정론 계약을 지킨다.
  const sorted = goals
    .flatMap((goal) => typeof goal.frontmatter.id === 'number' ? [{ goal, id: goal.frontmatter.id }] : [])
    .sort((a, b) => a.id - b.id)
  const dependencyAnalysis = analyzeGoalDependencies(goals)
  if (dependencyAnalysis.issues.length > 0 || dependencyAnalysis.invalidInProgress.length > 0) return null
  const isReady = (id: number): boolean => (dependencyAnalysis.waiting.get(id) ?? []).length === 0
  const ip = sorted.find(({ goal, id }) =>
    effectiveGoalStatus(goal.frontmatter) === 'IN_PROGRESS' && isReady(id)
  )
  if (ip) return ip.id
  const ns = sorted.find(({ goal, id }) => {
    const s = effectiveGoalStatus(goal.frontmatter)
    return (s === 'NOT_STARTED' || s === undefined) && isReady(id)
  })
  if (ns) return ns.id
  return null
}

function dependencyIssueText(issue: GoalDependencyIssue): string {
  switch (issue.kind) {
    case 'invalid':
      return ko.goal.dependencyInvalid(issue.goalId, issue.invalidTokens.map((token) => token || '(빈 값)').join(', '))
    case 'missing':
      return ko.goal.dependencyMissing(issue.goalId, issue.dependencyId)
    case 'self':
      return ko.goal.dependencySelf(issue.goalId)
    case 'cycle':
      return ko.goal.dependencyCycle(issue.cycle.join(' → '))
  }
}

function printDependencyIssues(issues: GoalDependencyIssue[]): void {
  if (issues.length === 0) return
  console.log(chalk.red(`  ❌ ${ko.goal.dependencyIssueHeader(issues.length)}`))
  for (const issue of issues) console.log(chalk.red(`     - ${dependencyIssueText(issue)}`))
  console.log(chalk.dim(`     ${ko.goal.dependencyFixHint}`))
}

function validateGoalSelection(analysis: GoalDependencyAnalysis): boolean {
  if (analysis.issues.length > 0) {
    printDependencyIssues(analysis.issues)
    process.exitCode = 1
    return false
  }
  if (analysis.invalidInProgress.length > 0) {
    for (const item of analysis.invalidInProgress) {
      console.log(chalk.red(`  ❌ ${ko.goal.dependencyInvalidInProgress(item.goalId, item.waitingFor.join(', '))}`))
    }
    process.exitCode = 1
    return false
  }
  return true
}

// #317: --id 는 양의 정수 문자열만 허용. Number() 강제변환은 ''·'   '→0, ' 1'→1, '1.5'→1.5 처럼
//        빈/공백/소수/앞뒤공백을 조용히 통과시켜 엉뚱한 goal(특히 goal 0)을 파괴적으로 건드린다.
//        엄격 정수 정규식 /^\d+$/ 로 거부 → 호출부가 친절 메시지를 띄우도록 sentinel 반환.
const INVALID_GOAL_ID = Symbol('invalid-goal-id')
function resolveGoalId(
  optId: string | undefined,
  goals: ParsedGoal[]
): number | null | typeof INVALID_GOAL_ID {
  if (optId !== undefined) {
    // 앞뒤 공백조차 거부 — ' 1' 은 Number(' 1')===1 로 엉뚱한 goal 을 가리키는 파괴적 입력.
    if (!/^\d+$/.test(optId)) return INVALID_GOAL_ID
    return Number(optId)
  }
  return selectActiveId(goals)
}

export async function goalList(): Promise<void> {
  console.log(chalk.bold(`\n${ko.goal.listTitle}\n`))
  const goals = listGoals(GOALS_DIR)
  const skipped = findSkippedGoalFiles(GOALS_DIR)
  if (goals.length === 0) {
    console.log(chalk.yellow('  📭 goals/ 디렉토리에 goal 파일이 없습니다.'))
    console.log(chalk.dim('  vhk goal init 으로 시작하세요.'))
    printSkippedGoalWarnings(skipped)
    return
  }
  const dependencyAnalysis = analyzeGoalDependencies(goals)
  for (const g of goals) {
    const fm = g.frontmatter
    const status = (effectiveGoalStatus(fm) ?? 'NOT_STARTED')
    const icon = STATUS_ICON[status] ?? '?'
    const id = String(fm.id).padStart(2)
    const pri = String(fm.priority ?? '--').padEnd(3)
    const ver = String(fm.version ?? '----').padEnd(6)
    console.log(
      `  [${id}] ${icon} ${status.padEnd(11)} ${pri} ${ver} ${fm.title ?? '(untitled)'}`
    )
    const waitingFor = typeof fm.id === 'number' ? dependencyAnalysis.waiting.get(fm.id) ?? [] : []
    if (waitingFor.length > 0) {
      console.log(chalk.dim(`       ↳ ${ko.goal.dependencyWaiting(waitingFor.join(', '))}`))
    }
  }
  // ① 중복 id 경고 — listGoals 는 첫 매치만 쓰므로 조용한 누락을 알린다.
  const dups = findDuplicateIds(goals)
  if (dups.length > 0) {
    console.log('')
    console.log(chalk.yellow(`  ${ko.goal.duplicateId(dups.join(', '))}`))
  }
  if (dependencyAnalysis.issues.length > 0) {
    console.log('')
    printDependencyIssues(dependencyAnalysis.issues)
  }
  // VHK-021: 스키마 불일치로 무시된 파일을 경고 (silent skip 제거).
  printSkippedGoalWarnings(skipped)
}

function printSkippedGoalWarnings(skipped: ReturnType<typeof findSkippedGoalFiles>): void {
  if (skipped.length > 0) {
    console.log('')
    console.log(chalk.yellow(`  ${ko.goal.skippedFiles(skipped.length)}`))
    for (const s of skipped) {
      console.log(chalk.yellow(`    - goals/${s.file}: ${s.reason}`))
    }
    console.log(chalk.dim('    필수: type: goal + 숫자 id. 스키마 전체: goals/_meta.md · vhk goal migrate'))
  }
}

/** active goal 한 건의 사람용 요약 — peek 과 next(상태 문서 미도입 경로)가 공유한다. */
function printActiveGoalSummary(activeId: number, active: ParsedGoal): void {
  console.log(`  ➡️  Goal ${activeId} — ${active.frontmatter.title ?? ''}`)
  console.log(
    chalk.dim(
      `     status: ${active.frontmatter.status ?? 'NOT_STARTED'}  ·  priority: ${active.frontmatter.priority ?? '--'}`
    )
  )
  console.log(chalk.dim(`     file: ${active.filePath}`))
}

export async function goalNext(cwd: string = process.cwd()): Promise<void> {
  if (!ensureNotHardStopped('goal next')) return // HARD_STOP 활성 시 next-task.md 변경 차단
  console.log(chalk.bold(`\n${ko.goal.nextTitle}\n`))
  const goals = listGoals(join(cwd, GOALS_DIR))
  // VHK-017: goal 0개와 '전부 완료'를 구분(같은 상태를 정반대로 묘사하던 오보 제거).
  if (goals.length === 0) {
    console.log(chalk.yellow('  📭 정의된 goal 이 없습니다.'))
    console.log(chalk.dim('  vhk goal init 으로 시작하세요.'))
    return
  }
  if (!validateGoalSelection(analyzeGoalDependencies(goals))) return
  const activeId = selectActiveId(goals)
  if (activeId === null) {
    console.log(chalk.green('  🎉 모든 goal 이 완료되었습니다!'))
    return
  }
  const active = goals.find((g) => g.frontmatter.id === activeId)
  if (!active) return

  // 112-T2: 없는 상태 문서 디렉터리를 새로 만들지 않는다.
  // why: docs/state/ 를 의도적으로 제거한 레포(공개 경계 정리)에서 next 가 디렉터리를 되살리면
  // 작업 상태의 원본이 둘로 갈린다 — 로드맵·카드가 원본인데 next-task.md 가 또 하나 생긴다.
  // 도입 여부는 `vhk goal init` 이 정하고, next 는 이미 도입한 프로젝트에서만 갱신한다.
  const stateDirAbs = join(cwd, STATE_DIR)
  if (!existsSync(stateDirAbs)) {
    printActiveGoalSummary(activeId, active)
    console.log('')
    console.log(chalk.dim(`  ${ko.goal.stateDirAbsent(STATE_DIR)}`))
    console.log(chalk.dim(`  ${ko.goal.stateDirAbsentHint(STATE_DIR)}`))
    return
  }

  const ts = new Date().toISOString()
  const text = [
    '# Next Task',
    '',
    `_Auto-updated ${ts} via \`vhk goal next\`._`,
    '',
    '```',
    `TASK: Goal ${activeId} — ${active.frontmatter.title ?? ''}`,
    `  status: ${active.frontmatter.status ?? 'NOT_STARTED'}`,
    `  priority: ${active.frontmatter.priority ?? '--'}`,
    `  file: ${active.filePath}`,
    '```',
    '',
  ].join('\n')
  // Goal 78: 덮어쓰기 전 기존 next-task.md 백업 — 조회 의도로 next 를 눌러도 수동 편집 복구 가능.
  // best-effort(백업 실패가 next 본기능을 막지 않음). 수동 편집 여부는 auto-update 마커 부재로 휴리스틱 판정.
  const nextTaskRel = join(STATE_DIR, 'next-task.md')
  const nextTaskAbs = join(cwd, nextTaskRel)
  if (existsSync(nextTaskAbs)) {
    const isManual = !readFileSync(nextTaskAbs, 'utf-8').includes('via `vhk goal next`')
    try {
      const b = saveBackup([nextTaskRel], cwd)
      pruneBackups(20, cwd)
      if (b.files.length > 0) console.log(chalk.dim(`  💾 백업: .vhk/backups/${b.id}/`))
    } catch {
      /* best-effort — 백업 실패해도 next 진행 */
    }
    if (isManual) {
      console.log(
        chalk.yellow('  ⚠️  기존 next-task.md 가 수동 편집본으로 보입니다 — 위 백업에서 복구 가능 (조회만 하려면 vhk goal peek)')
      )
    }
  }
  atomicWriteFile(nextTaskAbs, text) // Goal 40: 쓰기 중 kill 시 next-task.md 손상 방지
  console.log(
    chalk.green(
      `  ✅ next-task.md 갱신 — Goal ${activeId}: ${active.frontmatter.title ?? ''}`
    )
  )
}

/** Goal 78: 읽기 전용 다음 goal 조회 — next-task.md 를 건드리지 않는다(쓰기 0). 조회/변경 분리로 D1(파괴적 덮어쓰기) 회피. */
export async function goalPeek(cwd: string = process.cwd()): Promise<void> {
  console.log(chalk.bold(`\n${ko.goal.peekTitle}\n`))
  const goals = listGoals(join(cwd, GOALS_DIR))
  if (goals.length === 0) {
    console.log(chalk.yellow('  📭 정의된 goal 이 없습니다.'))
    console.log(chalk.dim('  vhk goal init 으로 시작하세요.'))
    return
  }
  if (!validateGoalSelection(analyzeGoalDependencies(goals))) return
  const activeId = selectActiveId(goals)
  if (activeId === null) {
    console.log(chalk.green('  🎉 모든 goal 이 완료되었습니다!'))
    return
  }
  const active = goals.find((g) => g.frontmatter.id === activeId)
  if (!active) return
  printActiveGoalSummary(activeId, active)
  console.log(chalk.dim('\n  (읽기 전용 — next-task.md 미변경. 갱신하려면 vhk goal next)'))
}

const META_TEMPLATE = `---
vhk_format: 1
type: meta
project: __FILL__
version: v0.1
---

# Common Gates

1. (프로젝트별 게이트 — 예: pnpm test:run)

## Forbidden Actions (전역)

- (해당 사항)

## Goal 파일 스키마 (필독 — VHK-021)

\`vhk goal list/next/check/done\` 는 \`goals/*.md\`(이 \`_meta.md\` 제외) 중 아래
frontmatter 를 만족하는 파일만 goal 로 인식한다. **하나라도 어긋나면 조용히 무시**되며
\`vhk goal list\` 가 경고로 알려준다.

| 필드 | 필수 | 값 |
| --- | --- | --- |
| \`type\` | ✅ | \`goal\` (문자열 그대로) |
| \`id\` | ✅ | **숫자만** (\`1\`, \`2\` … — \`G1\` 같은 문자열 ❌) |
| \`status\` | ✅ | \`NOT_STARTED\` \| \`IN_PROGRESS\` \| \`DONE\` \| \`BLOCKED\` |
| \`priority\` | 권장 | \`P0\` \| \`P1\` \| \`P2\` |
| \`title\` | 권장 | 한 줄 제목 |
| \`depends_on\` | 선택 | 먼저 끝나야 할 Goal ID를 쉼표로 구분 (예: \`1,2\`) |

파일명 규칙: \`goals/<id>-<name>.md\` (예: \`goals/1-login.md\`).

### 새 goal 템플릿 (복붙)

\`\`\`markdown
---
vhk_format: 1
type: goal
id: 1
title: 로그인 기능
status: NOT_STARTED
priority: P0
# 선택: depends_on: 1,2
---

# Goal 1: 로그인 기능

## 배경 / 동작 / Completion Check ...
\`\`\`

게이트 스크립트는 \`vhk goal sync\` 로 \`scripts/check-goal-<id>.mjs\` 를 백필한다.
`

// #328: 스캐폴드 본문에 auto-update 마커(`via \`vhk goal next\``)를 포함 — 없으면 첫 goal next 가
//        이 init 산출물을 '수동 편집본'으로 오탐(goalNext 의 isManual 휴리스틱이 마커 부재로 판정).
const STATE_NEXT_TASK_TEMPLATE =
  '# Next Task\n\n_Auto-updated via `vhk goal next`._\n\n```\nTASK: (vhk goal next 로 자동 갱신)\n```\n'
const STATE_BLOCKERS_TEMPLATE =
  '# Blockers\n\n_Append-only. 해결 항목은 ~~취소선~~으로 표기._\n'
const STATE_LEARNINGS_TEMPLATE =
  '# Learnings\n\n_Append-only. 한 줄 = 한 교훈._\n'

export async function goalInit(): Promise<void> {
  if (!ensureNotHardStopped('goal init')) return // HARD_STOP 활성 시 scaffold 생성 차단
  console.log(chalk.bold(`\n${ko.goal.initTitle}\n`))
  const targets: Array<{ path: string; content: string }> = [
    { path: join(GOALS_DIR, '_meta.md'), content: META_TEMPLATE },
    { path: join(STATE_DIR, 'next-task.md'), content: STATE_NEXT_TASK_TEMPLATE },
    { path: join(STATE_DIR, 'blockers.md'), content: STATE_BLOCKERS_TEMPLATE },
    { path: join(STATE_DIR, 'learnings.md'), content: STATE_LEARNINGS_TEMPLATE },
  ]
  mkdirSync(GOALS_DIR, { recursive: true })
  mkdirSync(STATE_DIR, { recursive: true })
  let created = 0
  let skipped = 0
  for (const t of targets) {
    if (existsSync(t.path)) {
      console.log(chalk.gray(`  ⊘ skip (이미 존재): ${t.path}`))
      skipped++
    } else {
      atomicWriteFile(t.path, t.content) // Goal 40: scaffold 첫 생성 원자적 쓰기
      console.log(chalk.green(`  ✓ created: ${t.path}`))
      created++
    }
  }
  console.log(chalk.bold(`\n  📊 created=${created} skipped=${skipped}`))
  if (created > 0) {
    printNextStep({
      message: 'goals/ 구조 스캐폴딩 완료!',
      command: 'vhk goal list',
      cursorHint: 'goal 목록 보여줘',
    })
  }
}

// 게이트 스크립트 찾기 — .mjs 우선 (cross-platform), .sh fallback (POSIX 호환).
// Windows 기본 환경에 bash/WSL 없어도 .mjs 가 있으면 통과.
export function findCheckScript(
  kind: 'goal' | 'rule',
  id: number | string,
  cwd = process.cwd()
): string | null {
  const mjs = join(SCRIPTS_DIR, `check-${kind}-${id}.mjs`)
  if (existsSync(join(cwd, mjs))) return mjs
  const sh = join(SCRIPTS_DIR, `check-${kind}-${id}.sh`)
  if (existsSync(join(cwd, sh))) return sh
  return null
}

export function findGateScript(id: number | string): string | null {
  return findCheckScript('goal', id)
}

export function findRuleCheckScript(id: string, cwd = process.cwd()): string | null {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) return null
  return findCheckScript('rule', id, cwd)
}

export function runCheckScript(scriptPath: string, cwd = process.cwd()): {
  ok: boolean
  out: string
  err: string
  runner: 'node' | 'bash'
} {
  const isMjs = scriptPath.endsWith('.mjs')
  const runner: 'node' | 'bash' = isMjs ? 'node' : 'bash'
  const r = safeExecFile(runner, [scriptPath], { cwd })
  const failureDetail = r.ok ? '' : [r.err, r.stderr].filter(Boolean).join('\n')
  return { ok: r.ok, out: r.out, err: failureDetail, runner }
}

function runGate(scriptPath: string): {
  ok: boolean
  out: string
  err: string
  runner: 'node' | 'bash'
} {
  return runCheckScript(scriptPath)
}

// Windows 에서 .sh 게이트(=bash 필요)를 만났을 때 cryptic ENOENT 대신 친절 안내.
// .mjs 가 있으면 findGateScript 가 먼저 잡으므로 이 경고는 .mjs 부재 시에만 뜬다.
function warnIfBashOnWindows(scriptPath: string): void {
  if (process.platform === 'win32' && scriptPath.endsWith('.sh')) {
    console.log(
      chalk.yellow(
        '  ⚠ Windows: .sh 게이트는 bash 가 필요합니다. cross-platform .mjs 로 백필하세요 → vhk goal sync'
      )
    )
  }
}

export async function goalCheck(opts: { id?: string; force?: boolean }): Promise<void> {
  console.log(chalk.bold(`\n${ko.goal.checkTitle}\n`))
  const goals = listGoals(GOALS_DIR)
  if (opts.id === undefined && !validateGoalSelection(analyzeGoalDependencies(goals))) return
  const id = resolveGoalId(opts.id, goals)
  // #317: 빈/공백/소수/문자 --id 는 강제변환 전에 거부 (goal 0 오염 방지).
  if (id === INVALID_GOAL_ID) {
    console.log(chalk.red(`  ❌ ${ko.goal.invalidId(opts.id ?? '')}`))
    process.exitCode = 1
    return
  }
  if (id === null) {
    // #329: --id 없이 active 없음 = 0개 또는 전부완료(정상). next 와 일관 안내 + exit 0.
    reportNoActiveGoal(goals)
    return
  }
  // ② 없는 goal id 는 게이트 검사 전에 통일된 메시지로 거부 (done 과 동일).
  const target = goals.find((g) => g.frontmatter.id === id)
  if (!target) {
    console.log(chalk.red(`  ❌ ${ko.goal.notFound(id)}`))
    process.exitCode = 1
    return
  }
  // #155: DONE goal 은 게이트 재실행을 스킵한다 — mission.json 등 외부 상태 드리프트로 이미
  //       완료된 goal 이 재실패하지 않게. 재검증이 필요하면 --force.
  if (target.frontmatter.status === 'DONE' && !opts.force) {
    console.log(chalk.green(`  ✅ Goal ${id} 는 DONE — 게이트 재검증 스킵.`))
    console.log(chalk.dim(`     (재실행하려면: vhk goal check --id ${id} --force)`))
    return
  }
  const scriptPath = findGateScript(id)
  if (!scriptPath) {
    console.log(
      chalk.red(`  ❌ 게이트 스크립트 없음: scripts/check-goal-${id}.{mjs,sh}`)
    )
    printNextStep({
      message: '누락된 게이트 스크립트를 백필한 뒤 다시 확인하세요:',
      command: 'vhk goal sync',
      cursorHint: 'goal 게이트 스크립트 동기화해줘',
    })
    process.exitCode = 1
    return
  }
  warnIfBashOnWindows(scriptPath)
  const gate = runGate(scriptPath)
  console.log(chalk.dim(`  ▶ ${gate.runner} ${scriptPath}\n`))
  if (gate.out) console.log(gate.out)
  if (gate.ok) {
    console.log(chalk.green(`\n  ✅ Goal ${id} 게이트 통과`))
  } else {
    console.log(chalk.red(`\n  ❌ Goal ${id} 게이트 실패`))
    if (gate.err && !gate.out) console.log(chalk.dim(gate.err.slice(0, 500)))
    process.exitCode = 1
  }
}

// Goal 43: goal 상태 ↔ 코드 현실 드리프트 점검 (read-only — HARD_STOP 가드 없음, check/list 와 동일).
// "shipped 인데 status: NOT_STARTED" 인 goal 을 잡아 exit 1. 깨끗하면 exit 0.
export async function goalDrift(): Promise<void> {
  console.log(chalk.bold(`\n${ko.goal.driftTitle}\n`))
  // projectRoot=cwd — 소비자 레포 goals 본문 경로 증거(축약·exact) 해석용
  const candidates = findStatusDriftCandidates(GOALS_DIR, SCRIPTS_DIR, process.cwd())
  if (candidates.length === 0) {
    console.log(chalk.green(`  ✅ ${ko.goal.driftClean}`))
    return
  }
  console.log(chalk.red(`  ❌ ${ko.goal.driftFound(candidates.length)}\n`))
  for (const c of candidates) {
    console.log(chalk.yellow(`  [${c.id}] ${c.title}`))
    console.log(chalk.dim(`      ${c.reason}`))
    console.log(chalk.dim(`      ${c.goalFile} · ${c.scriptFile}`))
  }
  console.log(
    chalk.dim(
      '\n  → 구현됐다면 `vhk goal done --id <n>` 로 DONE 전환, 아니라면 게이트의 goal 고유 검증을 제거하세요.'
    )
  )
  process.exitCode = 1
}

export async function goalDone(opts: { id?: string }): Promise<void> {
  if (!ensureNotHardStopped('goal done')) return // HARD_STOP 활성 시 status 전이 차단
  console.log(chalk.bold(`\n${ko.goal.doneTitle}\n`))
  const goals = listGoals(GOALS_DIR)
  const dependencyAnalysis = analyzeGoalDependencies(goals)
  if (opts.id === undefined && !validateGoalSelection(dependencyAnalysis)) return
  const id = resolveGoalId(opts.id, goals)
  // #317: 잘못된 --id 로 goal 0 을 조용히 DONE 처리하던 데이터 오염 차단.
  if (id === INVALID_GOAL_ID) {
    console.log(chalk.red(`  ❌ ${ko.goal.invalidId(opts.id ?? '')}`))
    process.exitCode = 1
    return
  }
  if (id === null) {
    // #329: --id 없이 active 없음 = 0개 또는 전부완료(정상). next 와 일관 안내 + exit 0.
    reportNoActiveGoal(goals)
    return
  }
  const target = goals.find((g) => g.frontmatter.id === id)
  if (!target) {
    // ② check 와 동일한 메시지로 통일.
    console.log(chalk.red(`  ❌ ${ko.goal.notFound(id)}`))
    process.exitCode = 1
    return
  }
  const targetDependencyIssues = dependencyIssuesForGoal(id, dependencyAnalysis)
  if (targetDependencyIssues.length > 0) {
    printDependencyIssues(targetDependencyIssues)
    process.exitCode = 1
    return
  }
  const waitingFor = dependencyAnalysis.waiting.get(id) ?? []
  if (waitingFor.length > 0) {
    console.log(chalk.red(`  ❌ ${ko.goal.dependencyDoneBlocked(id, waitingFor.join(', '))}`))
    process.exitCode = 1
    return
  }
  const scriptPath = findGateScript(id)
  if (!scriptPath) {
    console.log(
      chalk.red(
        `  ❌ 게이트 스크립트 없음 — done 처리 거부: scripts/check-goal-${id}.{mjs,sh}`
      )
    )
    process.exitCode = 1
    return
  }
  warnIfBashOnWindows(scriptPath)
  const gate = runGate(scriptPath)
  // #287: 게이트 출력(빌드·테스트 로그)은 길어서, stdout 파이프가 조기 종료되면(예: PowerShell
  //       `... | Select -First N`) 이 write 에서 EPIPE 가 난다. Windows 는 파이프 write 가 동기라
  //       EPIPE 가 throw 되어 스택을 풀고 나가 버려 — 아래 상태 전이(atomicWriteFile)에 도달하지 못한다.
  //       그래서 게이트 통과 시 '부수효과(상태 전이)'를 출력보다 먼저 수행한다(출력 소비 여부와 무관하게 전이 보장).
  const showGateOutput = (): void => {
    console.log(chalk.dim(`  ▶ 게이트 검증: ${gate.runner} ${scriptPath}\n`))
    if (gate.out) console.log(gate.out)
  }
  if (!gate.ok) {
    // Forbidden: 게이트 실패에도 done 으로 마킹 금지. frontmatter 변경 없이 종료.
    showGateOutput()
    console.log(
      chalk.red(
        `\n  ❌ 게이트 실패 — frontmatter 변경 없이 종료. (Forbidden: 실패 = 보존)`
      )
    )
    process.exitCode = 1
    return
  }
  const content = readFileSync(target.filePath, 'utf-8')
  const today = localDate() // VHK-019
  const updated = updateFrontmatterStatus(content, 'DONE', { completed: today })
  if (updated === content) {
    // 갱신 결과 무변경 — frontmatter 미인식(손상·마커 누락) 또는 이미 동일 상태. "✅ DONE" 거짓 성공 방지.
    showGateOutput()
    console.log(
      chalk.yellow(
        `\n  ⚠ frontmatter 갱신 결과 변경 없음 — 이미 DONE(completed: ${today})이거나 frontmatter 형식 미인식. 파일을 확인하세요.`
      )
    )
    process.exitCode = 1
    return
  }
  // #287: durable write 를 출력보다 먼저 — 파이프가 끊겨(EPIPE) 후속 console.log 가 죽어도 전이는 이미 디스크에 안전.
  atomicWriteFile(target.filePath, updated) // Goal 40: frontmatter 갱신 중 kill 시 goal 파일 손상 방지
  showGateOutput()
  console.log(chalk.green(`\n  ✅ Goal ${id} → DONE (completed: ${today})`))
  printNextStep({
    message: `Goal ${id} 완료! 다음 goal 로:`,
    command: 'vhk goal next',
    cursorHint: '다음 goal 알려줘',
  })
}

// ─── goal sync (게이트 스크립트 백필) ──────────────────────────────────────
// goals/*.md 를 SoT 로, id 마다 check-goal-{id}.mjs 가 없으면 자동 스캐폴드.
// 자체완결형(.mjs) — 대상 프로젝트에 _lib.mjs/check-meta.mjs 가 없어도 동작.
// 기본 게이트 = typecheck + (lint) + test + build. cross-platform (Windows 1급).
function generateGateScript(id: number | string): string {
  const ID = String(id)
  return [
    '#!/usr/bin/env node',
    `// scripts/check-goal-${ID}.mjs — 자동 생성 (vhk goal sync).`,
    '// 기본 게이트 = typecheck + (lint) + test + build. goal 고유 검증은 아래 구역에 추가.',
    '// sync 재실행해도 기존 파일은 덮어쓰지 않습니다 (idempotent).',
    '//',
    '// Env: VHK_GATES_SKIP_DEEP=1  → test + build 스킵 (빠른 typecheck-only 패스)',
    '',
    "import { execFileSync } from 'node:child_process'",
    "import { existsSync, readFileSync } from 'node:fs'",
    '',
    "const SHIM = new Set(['pnpm', 'npm', 'npx', 'yarn'])",
    "// cmd.exe /c 래핑 경로는 따옴표+&|<>^% 조합 인자로 인용 경계를 탈출당할 수 있다(CVE-2024-27980",
    "// 과 같은 근본원인 클래스, src/lib/exec.ts 실증) — 위험 문자 있으면 거부(fail-closed).",
    "const CMD_SHELL_METACHARS = /[&|<>^%\"\\r\\n]/",
    'function run(cmd, args) {',
    '  let bin = cmd, argv = args',
    "  if (process.platform === 'win32' && SHIM.has(cmd)) {",
    "    const bad = args.find((a) => CMD_SHELL_METACHARS.test(a))",
    "    if (bad !== undefined) {",
    "      console.log('안전하지 않은 인자 거부 — cmd.exe 특수문자 포함: ' + JSON.stringify(bad))",
    '      return false',
    '    }',
    "    // Windows: .cmd shim 직접 spawn 은 Node CVE-2024-27980 으로 EINVAL → cmd.exe 래핑.",
    "    bin = 'cmd.exe'; argv = ['/d', '/s', '/c', cmd + '.cmd', ...args]",
    '  }',
    '  try {',
    "    // maxBuffer 상향: 큰 빌드/테스트 로그(>1MB)에서 성공해도 ENOBUFS 거짓실패 방지.",
    "    execFileSync(bin, argv, { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })",
    '    return true',
    '  } catch (e) {',
    "    const out = (e?.stdout?.toString() ?? '') + (e?.stderr?.toString() ?? '')",
    "    if (out.trim()) console.log(out.split('\\n').slice(-25).join('\\n'))",
    '    return false',
    '  }',
    '}',
    '',
    "if (existsSync('.vhk/HARD_STOP')) {",
    `  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal ${ID} gate.')`,
    '  process.exit(1)',
    '}',
    '',
    '// BOM-safe 읽기: PowerShell Set-Content -Encoding utf8 의 UTF-8 BOM 제거(없으면 throw).',
    "const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }",
    "const pkg = existsSync('package.json') ? readJson('package.json') : {}",
    'const scripts = pkg.scripts ?? {}',
    "const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'",
    "const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'",
    'let pass = true',
    `const gate = (label, ok) => { console.log('[goal ${ID}] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }`,
    'const must = (cond, label) => { console.log((cond ? \'    ✓ \' : \'    ✗ \') + label); if (!cond) pass = false }',
    '',
    '// typecheck (스크립트 우선, 없으면 tsc --noEmit)',
    "if (scripts.typecheck) gate('typecheck', run(pm, ['run', 'typecheck']))",
    "else if (existsSync('tsconfig.json')) gate('tsc --noEmit', run(pm, pm === 'npm' ? ['exec', '--', 'tsc', '--noEmit'] : ['exec', 'tsc', '--noEmit']))",
    "if (scripts.lint) gate('lint', run(pm, ['run', 'lint']))",
    'if (!skipDeep) {',
    "  if (scripts['test:run']) gate('test', run(pm, ['run', 'test:run']))",
    "  else if (scripts.test && /vitest/.test(scripts.test)) gate('test', run(pm, ['run', 'test', '--', '--run']))",
    "  else if (scripts.test) gate('test', run(pm, ['run', 'test']))",
    "  if (scripts.build) gate('build', run(pm, ['run', 'build']))",
    '}',
    '',
    `// ─── goal ${ID} 고유 검증 (직접 추가) ───────────────────────────────`,
    "// const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null",
    "// must(read('src/foo.ts')?.includes('bar'), 'foo.ts 에 bar 존재')",
    '',
    `if (pass) { console.log('✅ goal ${ID} gate passes'); process.exit(0) }`,
    `console.log('❌ goal ${ID} gate failed'); process.exit(1)`,
    '',
  ].join('\n')
}

export interface GoalSyncResult {
  created: number[]
  skipped: number[]
}

export async function goalSync(): Promise<GoalSyncResult> {
  if (!ensureNotHardStopped('goal sync')) return { created: [], skipped: [] } // #334: HARD_STOP 활성 시 게이트 스크립트 생성 차단
  console.log(chalk.bold(`\n${ko.goal.syncTitle}\n`))
  const goals = listGoals(GOALS_DIR)
  const result: GoalSyncResult = { created: [], skipped: [] }
  if (goals.length === 0) {
    console.log(
      chalk.yellow('  📭 goals/ 에 goal 파일이 없습니다. vhk goal init 으로 시작하세요.')
    )
    return result
  }
  mkdirSync(SCRIPTS_DIR, { recursive: true })
  for (const g of goals) {
    const id = g.frontmatter.id
    if (typeof id !== 'number') continue
    // idempotency 기준 = .mjs 존재 여부 (findGateScript 아님).
    // .sh 만 있는 legacy goal 은 .mjs 를 백필해야 Windows 1급(bash 불필요)이 성립한다.
    // (.mjs 가 이미 있으면 절대 덮어쓰지 않음 — 손추가한 goal-specific 검증 보존.)
    const target = join(SCRIPTS_DIR, `check-goal-${id}.mjs`)
    if (existsSync(target)) {
      console.log(chalk.gray(`  ⊘ skip (이미 존재): ${target}`))
      result.skipped.push(id)
      continue
    }
    const shOnly = existsSync(join(SCRIPTS_DIR, `check-goal-${id}.sh`))
    writeFileSync(target, generateGateScript(id), 'utf-8')
    console.log(
      chalk.green(`  ✓ created: ${target}${shOnly ? '  (.sh → .mjs 백필, Windows 1급)' : ''}`)
    )
    result.created.push(id)
  }
  console.log(
    chalk.bold(`\n  📊 created=${result.created.length} skipped=${result.skipped.length}`)
  )
  if (result.created.length > 0) {
    printNextStep({
      message: `게이트 스크립트 ${result.created.length}개 생성 (goal ${result.created.join(', ')}). 검증하려면:`,
      command: `vhk goal check --id ${result.created[0]}`,
      cursorHint: `goal ${result.created[0]} 게이트 검증해줘`,
    })
  }
  return result
}

export async function goalMigrate(opts: { dryRun?: boolean } = {}): Promise<void> {
  if (!ensureNotHardStopped('goal migrate')) return
  const dryRun = opts.dryRun === true
  console.log(chalk.bold(`\n${ko.goal.migrateTitle}${dryRun ? ' (dry-run)' : ''}\n`))
  let entries: string[]
  try {
    entries = readdirSync(GOALS_DIR)
  } catch {
    console.log(chalk.yellow('  📭 goals/ 디렉토리가 없습니다.'))
    return
  }
  const plans: { file: string; actions: string[]; path: string; nextContent: string }[] = []
  for (const name of entries) {
    if (!name.endsWith('.md') || name === '_meta.md') continue
    const fp = join(GOALS_DIR, name)
    let content: string
    try {
      content = readFileSync(fp, 'utf-8')
    } catch {
      continue
    }
    const plan = planGoalFileMigrate(fp, content)
    if (!plan) continue
    plans.push({ file: name, actions: plan.actions, path: fp, nextContent: plan.nextContent })
  }
  if (plans.length === 0) {
    console.log(chalk.green('  ✓ migrate 대상 없음 (이미 표준 스키마)'))
    return
  }
  for (const p of plans) {
    console.log(chalk.cyan(`  goals/${p.file}`))
    for (const a of p.actions) console.log(chalk.dim(`    · ${a}`))
    if (!dryRun) atomicWriteFile(p.path, p.nextContent)
  }
  console.log('')
  console.log(
    chalk.bold(`  📊 ${dryRun ? 'would migrate' : 'migrated'}=${plans.length}`),
  )
  if (dryRun) {
    printNextStep({
      message: '미리보기만 — 적용하려면:',
      command: 'vhk goal migrate',
      cursorHint: 'goal migrate 실행해줘',
    })
  } else {
    printNextStep({
      message: 'migrate 완료 — 목록 확인:',
      command: 'vhk goal list',
      cursorHint: 'goal list 보여줘',
    })
  }
}
