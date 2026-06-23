import { existsSync, mkdirSync, readFileSync, appendFileSync, unlinkSync } from 'node:fs'
import { atomicWriteFile } from './atomic-write.js'
import { join } from 'node:path'
import { localDate } from './date.js'

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
  return localDate() // VHK-019: 로컬 타임존 날짜(UTC slice 는 KST 새벽에 하루 밀림)
}

// "- [YYYY-MM-DD goal-N] ..." 패턴이지만 ~~strikethrough~~ 로 감싸진 항목은
// resolved 로 간주 → 카운트 제외.
const ACTIVE_BLOCKER_RE = /^- (?!~~)\[/

// #159: 도그푸딩/테스트용 blocker([dogfood] 또는 [skip-hardstop] 태그)는 HARD_STOP 임계값
//       카운트에서 제외 — 명령 흐름 점검이 3건 누적되어 자동화를 멈추는 자기방해 방지.
const SKIP_HARDSTOP_RE = /\[(dogfood|skip-hardstop)\]/i

export function countActiveBlockers(content: string): number {
  let count = 0
  for (const line of content.split(/\r?\n/)) {
    if (ACTIVE_BLOCKER_RE.test(line) && !SKIP_HARDSTOP_RE.test(line)) count++
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
    atomicWriteFile(
      BLOCKERS_PATH,
      `# Blockers\n\n_Append-only. 해결 항목은 ~~취소선~~으로 표기._\n\n${line}\n`
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

// NOTE(v2.0): appendLearning/getRecentLearnings 제거됨. 교훈 SoT 는 memory v2 failures.lesson
//   (vhk learn → recordLesson). learnings.md 는 v1→v2 마이그레이션 **읽기 소스**로만 남는다
//   (memory.ts readLearningsRaw 가 직접 읽음 — 신규 기록 경로 없음).

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
  atomicWriteFile(HARD_STOP_PATH, `${ts}\n${reason}\n`)
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
  unlinkSync(HARD_STOP_PATH) // #353: rmSync(파일)이 이 Node 환경에서 silent exit 127 → unlinkSync (존재는 위 existsSync 로 확인). 상세 TS-005.
  return true
}
