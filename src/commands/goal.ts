import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'
import { ko } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { safeExecFile } from '../lib/exec.js'
import {
  listGoals,
  findDuplicateIds,
  updateFrontmatterStatus,
  type GoalStatus,
  type ParsedGoal,
} from '../lib/goal-frontmatter.js'

const GOALS_DIR = 'goals'
const STATE_DIR = 'docs/state'
const SCRIPTS_DIR = 'scripts'

const STATUS_ICON: Record<GoalStatus, string> = {
  NOT_STARTED: '⚪',
  IN_PROGRESS: '🟡',
  DONE: '✅',
  BLOCKED: '🛑',
}

// active goal 선택: IN_PROGRESS 우선, 없으면 첫 NOT_STARTED.
// (BLOCKED 는 자동 선택 안 함 — 사람이 풀어야 함.)
export function selectActiveId(goals: ParsedGoal[]): number | null {
  const ip = goals.find((g) => g.frontmatter.status === 'IN_PROGRESS')
  if (ip && typeof ip.frontmatter.id === 'number') return ip.frontmatter.id
  const ns = goals.find(
    (g) =>
      g.frontmatter.status === 'NOT_STARTED' || g.frontmatter.status === undefined
  )
  if (ns && typeof ns.frontmatter.id === 'number') return ns.frontmatter.id
  return null
}

function resolveGoalId(optId: string | undefined, goals: ParsedGoal[]): number | null {
  if (optId !== undefined) {
    const n = Number(optId)
    if (!Number.isFinite(n)) return null
    return n
  }
  return selectActiveId(goals)
}

export async function goalList(): Promise<void> {
  console.log(chalk.bold(`\n${ko.goal.listTitle}\n`))
  const goals = listGoals(GOALS_DIR)
  if (goals.length === 0) {
    console.log(chalk.yellow('  📭 goals/ 디렉토리에 goal 파일이 없습니다.'))
    console.log(chalk.dim('  vhk goal init 으로 시작하세요.'))
    return
  }
  for (const g of goals) {
    const fm = g.frontmatter
    const status = (fm.status ?? 'NOT_STARTED') as GoalStatus
    const icon = STATUS_ICON[status] ?? '?'
    const id = String(fm.id).padStart(2)
    const pri = String(fm.priority ?? '--').padEnd(3)
    const ver = String(fm.version ?? '----').padEnd(6)
    console.log(
      `  [${id}] ${icon} ${status.padEnd(11)} ${pri} ${ver} ${fm.title ?? '(untitled)'}`
    )
  }
  // ① 중복 id 경고 — listGoals 는 첫 매치만 쓰므로 조용한 누락을 알린다.
  const dups = findDuplicateIds(goals)
  if (dups.length > 0) {
    console.log('')
    console.log(chalk.yellow(`  ${ko.goal.duplicateId(dups.join(', '))}`))
  }
}

export async function goalNext(): Promise<void> {
  console.log(chalk.bold(`\n${ko.goal.nextTitle}\n`))
  const goals = listGoals(GOALS_DIR)
  const activeId = selectActiveId(goals)
  if (activeId === null) {
    console.log(chalk.green('  🎉 모든 goal 이 완료되었습니다!'))
    return
  }
  const active = goals.find((g) => g.frontmatter.id === activeId)
  if (!active) return
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
  mkdirSync(STATE_DIR, { recursive: true })
  writeFileSync(join(STATE_DIR, 'next-task.md'), text, 'utf-8')
  console.log(
    chalk.green(
      `  ✅ next-task.md 갱신 — Goal ${activeId}: ${active.frontmatter.title ?? ''}`
    )
  )
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
`

const STATE_NEXT_TASK_TEMPLATE = '# Next Task\n\n```\nTASK: (vhk goal next 로 자동 갱신)\n```\n'
const STATE_BLOCKERS_TEMPLATE =
  '# Blockers\n\n_Append-only. 해결 항목은 ~~취소선~~으로 표기._\n'
const STATE_LEARNINGS_TEMPLATE =
  '# Learnings\n\n_Append-only. 한 줄 = 한 교훈._\n'

export async function goalInit(): Promise<void> {
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
      writeFileSync(t.path, t.content, 'utf-8')
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
export function findGateScript(id: number | string): string | null {
  const mjs = join(SCRIPTS_DIR, `check-goal-${id}.mjs`)
  if (existsSync(mjs)) return mjs
  const sh = join(SCRIPTS_DIR, `check-goal-${id}.sh`)
  if (existsSync(sh)) return sh
  return null
}

function runGate(scriptPath: string): {
  ok: boolean
  out: string
  err: string
  runner: 'node' | 'bash'
} {
  const isMjs = scriptPath.endsWith('.mjs')
  const runner: 'node' | 'bash' = isMjs ? 'node' : 'bash'
  const r = safeExecFile(runner, [scriptPath])
  return { ok: r.ok, out: r.out, err: r.ok ? '' : r.err, runner }
}

export async function goalCheck(opts: { id?: string }): Promise<void> {
  console.log(chalk.bold(`\n${ko.goal.checkTitle}\n`))
  const goals = listGoals(GOALS_DIR)
  const id = resolveGoalId(opts.id, goals)
  if (id === null) {
    console.log(
      chalk.yellow('  ⚠ 대상 goal 을 결정할 수 없습니다 (--id 명시 또는 active goal 필요).')
    )
    process.exitCode = 1
    return
  }
  // ② 없는 goal id 는 게이트 검사 전에 통일된 메시지로 거부 (done 과 동일).
  if (!goals.some((g) => g.frontmatter.id === id)) {
    console.log(chalk.red(`  ❌ ${ko.goal.notFound(id)}`))
    process.exitCode = 1
    return
  }
  const scriptPath = findGateScript(id)
  if (!scriptPath) {
    console.log(
      chalk.red(`  ❌ 게이트 스크립트 없음: scripts/check-goal-${id}.{mjs,sh}`)
    )
    process.exitCode = 1
    return
  }
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

export async function goalDone(opts: { id?: string }): Promise<void> {
  console.log(chalk.bold(`\n${ko.goal.doneTitle}\n`))
  const goals = listGoals(GOALS_DIR)
  const id = resolveGoalId(opts.id, goals)
  if (id === null) {
    console.log(
      chalk.yellow('  ⚠ 대상 goal 을 결정할 수 없습니다 (--id 명시 또는 active goal 필요).')
    )
    process.exitCode = 1
    return
  }
  const target = goals.find((g) => g.frontmatter.id === id)
  if (!target) {
    // ② check 와 동일한 메시지로 통일.
    console.log(chalk.red(`  ❌ ${ko.goal.notFound(id)}`))
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
  const gate = runGate(scriptPath)
  console.log(chalk.dim(`  ▶ 게이트 검증: ${gate.runner} ${scriptPath}\n`))
  if (gate.out) console.log(gate.out)
  if (!gate.ok) {
    // Forbidden: 게이트 실패에도 done 으로 마킹 금지. frontmatter 변경 없이 종료.
    console.log(
      chalk.red(
        `\n  ❌ 게이트 실패 — frontmatter 변경 없이 종료. (Forbidden: 실패 = 보존)`
      )
    )
    process.exitCode = 1
    return
  }
  const content = readFileSync(target.filePath, 'utf-8')
  const today = new Date().toISOString().slice(0, 10)
  const updated = updateFrontmatterStatus(content, 'DONE', { completed: today })
  writeFileSync(target.filePath, updated, 'utf-8')
  console.log(chalk.green(`\n  ✅ Goal ${id} → DONE (completed: ${today})`))
  printNextStep({
    message: `Goal ${id} 완료! 다음 goal 로:`,
    command: 'vhk goal next',
    cursorHint: '다음 goal 알려줘',
  })
}
