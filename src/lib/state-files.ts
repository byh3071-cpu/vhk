import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

// docs/state/{next-task,blockers,learnings}.md 와 .vhk/HARD_STOP 의
// append-only / 카운트 / 트립와이어 동작을 한 곳에 모은 헬퍼.
// Forbidden (goals/2-agent-loop.md): 과거 항목 수정 금지 — append 만 노출.

export const STATE_DIR = 'docs/state'
export const BLOCKERS_PATH = join(STATE_DIR, 'blockers.md')
export const LEARNINGS_PATH = join(STATE_DIR, 'learnings.md')
export const VHK_DIR = '.vhk'
export const HARD_STOP_PATH = join(VHK_DIR, 'HARD_STOP')

// 블로커 누적 시 자동 HARD_STOP 임계값. goals/2-agent-loop.md 명시.
export const HARD_STOP_BLOCKER_THRESHOLD = 3

function ensureStateDir(): void {
  mkdirSync(STATE_DIR, { recursive: true })
}

function ensureVhkDir(): void {
  mkdirSync(VHK_DIR, { recursive: true })
}

function isoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

// "- [YYYY-MM-DD goal-N] ..." 패턴이지만 ~~strikethrough~~ 로 감싸진 항목은
// resolved 로 간주 → 카운트 제외.
const ACTIVE_BLOCKER_RE = /^- (?!~~)\[/

export function countActiveBlockers(content: string): number {
  let count = 0
  for (const line of content.split(/\r?\n/)) {
    if (ACTIVE_BLOCKER_RE.test(line)) count++
  }
  return count
}

export function appendBlocker(description: string, goalId?: number): {
  count: number
  hardStopTripped: boolean
} {
  ensureStateDir()
  const tag = goalId !== undefined ? `goal-${goalId}` : 'no-goal'
  const line = `- [${isoDate()} ${tag}] ${description.trim()}`
  if (!existsSync(BLOCKERS_PATH)) {
    writeFileSync(
      BLOCKERS_PATH,
      `# Blockers\n\n_Append-only. 해결 항목은 ~~취소선~~으로 표기._\n\n${line}\n`,
      'utf-8'
    )
  } else {
    appendFileSync(BLOCKERS_PATH, `${line}\n`, 'utf-8')
  }
  const current = readFileSync(BLOCKERS_PATH, 'utf-8')
  const count = countActiveBlockers(current)
  let hardStopTripped = false
  if (count >= HARD_STOP_BLOCKER_THRESHOLD && !existsSync(HARD_STOP_PATH)) {
    writeHardStop(`auto: ${count} active blockers (threshold ${HARD_STOP_BLOCKER_THRESHOLD})`)
    hardStopTripped = true
  }
  return { count, hardStopTripped }
}

export function appendLearning(lesson: string, goalId?: number): void {
  ensureStateDir()
  const tag = goalId !== undefined ? `goal-${goalId}` : 'no-goal'
  const line = `- [${isoDate()} ${tag}] ${lesson.trim()}`
  if (!existsSync(LEARNINGS_PATH)) {
    writeFileSync(
      LEARNINGS_PATH,
      `# Learnings\n\n_Append-only. 한 줄 = 한 교훈._\n\n${line}\n`,
      'utf-8'
    )
  } else {
    appendFileSync(LEARNINGS_PATH, `${line}\n`, 'utf-8')
  }
}

// learnings.md 의 마지막 N 줄 (헤더/메타 제외) 을 반환. vhk context 가 사용.
export function getRecentLearnings(limit = 3): string[] {
  if (!existsSync(LEARNINGS_PATH)) return []
  const lines = readFileSync(LEARNINGS_PATH, 'utf-8').split(/\r?\n/)
  const entries = lines.filter((l) => l.startsWith('- ['))
  return entries.slice(-limit)
}

// blockers.md 의 blocker 항목(활성 "- [" + 해결 "- ~~[") 중 마지막 N 개. vhk context 토큰 절감용.
const BLOCKER_ENTRY_RE = /^- (~~)?\[/
export function getRecentBlockers(limit = 3): string[] {
  if (!existsSync(BLOCKERS_PATH)) return []
  const lines = readFileSync(BLOCKERS_PATH, 'utf-8').split(/\r?\n/)
  const entries = lines.filter((l) => BLOCKER_ENTRY_RE.test(l))
  return entries.slice(-limit)
}

// 활성 blocker(해결 ~~취소선~~ 제외) 중 마지막 N 개. context 가 "지금 막힌 것"만 보이게 한다.
export function getActiveBlockers(limit = 3): string[] {
  if (!existsSync(BLOCKERS_PATH)) return []
  const lines = readFileSync(BLOCKERS_PATH, 'utf-8').split(/\r?\n/)
  const entries = lines.filter((l) => ACTIVE_BLOCKER_RE.test(l))
  return entries.slice(-limit)
}

export function writeHardStop(reason: string): void {
  ensureVhkDir()
  const ts = new Date().toISOString()
  writeFileSync(HARD_STOP_PATH, `${ts}\n${reason}\n`, 'utf-8')
}

export function isHardStopActive(): boolean {
  return existsSync(HARD_STOP_PATH)
}

export function readHardStopReason(): string | null {
  if (!existsSync(HARD_STOP_PATH)) return null
  try {
    return readFileSync(HARD_STOP_PATH, 'utf-8').trim()
  } catch {
    return null
  }
}

// 명시적 해제. 자동 호출 금지 (Forbidden) — 호출자가 사용자 의도 (--confirm) 확인 책임.
export function clearHardStop(): boolean {
  if (!existsSync(HARD_STOP_PATH)) return false
  rmSync(HARD_STOP_PATH, { force: true })
  return true
}
