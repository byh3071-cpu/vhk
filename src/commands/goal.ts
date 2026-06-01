import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'
import { ko } from '../i18n/ko.js'
import { localDate } from '../lib/date.js'
import { printNextStep } from '../lib/next-step.js'
import { safeExecFile } from '../lib/exec.js'
import {
  listGoals,
  findDuplicateIds,
  findSkippedGoalFiles,
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
  const skipped = findSkippedGoalFiles(GOALS_DIR)
  if (goals.length === 0) {
    console.log(chalk.yellow('  📭 goals/ 디렉토리에 goal 파일이 없습니다.'))
    console.log(chalk.dim('  vhk goal init 으로 시작하세요.'))
    printSkippedGoalWarnings(skipped)
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
    console.log(chalk.dim('    필수: type: goal + 숫자 id. 스키마 전체: goals/_meta.md'))
  }
}

export async function goalNext(): Promise<void> {
  console.log(chalk.bold(`\n${ko.goal.nextTitle}\n`))
  const goals = listGoals(GOALS_DIR)
  // VHK-017: goal 0개와 '전부 완료'를 구분(같은 상태를 정반대로 묘사하던 오보 제거).
  if (goals.length === 0) {
    console.log(chalk.yellow('  📭 정의된 goal 이 없습니다.'))
    console.log(chalk.dim('  vhk goal init 으로 시작하세요.'))
    return
  }
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
---

# Goal 1: 로그인 기능

## 배경 / 동작 / Completion Check ...
\`\`\`

게이트 스크립트는 \`vhk goal sync\` 로 \`scripts/check-goal-<id>.mjs\` 를 백필한다.
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
  warnIfBashOnWindows(scriptPath)
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
  const today = localDate() // VHK-019
  const updated = updateFrontmatterStatus(content, 'DONE', { completed: today })
  writeFileSync(target.filePath, updated, 'utf-8')
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
    'function run(cmd, args) {',
    '  let bin = cmd, argv = args',
    "  if (process.platform === 'win32' && SHIM.has(cmd)) {",
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
    "const pkg = existsSync('package.json') ? JSON.parse(readFileSync('package.json', 'utf-8')) : {}",
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
