/**
 * vhk watch — 무인 세션 정지 감시 (수준 2: 감지 + 알림).
 *
 * 배경(2026-07-01 밤샘루프 사건): 무인 자율 루프가 새벽에 조용히 탈선/정지해도
 * 아침까지 아무도 모름(8.5h 무감지). 감시자는 에이전트가 아닌 경량 폴러여야 한다 —
 * Claude Code 세션 로그(~/.claude/projects/<proj>/<session>.jsonl)의 mtime 을 폴링해
 * idle 초과 시 텔레그램+콘솔로 1회 알리고, 활동 재개 시 recovered 후 재무장한다.
 * "완료"와 "멈춤"은 로그만으론 구분 불가 — 둘 다 사람이 확인할 신호이므로 함께 알린다.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import chalk from 'chalk'
import { ko } from '../i18n/ko.js'

export interface SessionInfo {
  file: string
  project: string
  sessionId: string
  mtimeMs: number
}

export interface TrackedSession {
  lastMtimeMs: number
  alerted: boolean
}

/** file 경로 → 추적 상태 */
export type WatchState = Map<string, TrackedSession>

export interface WatchEvent {
  kind: 'stalled' | 'recovered'
  session: SessionInfo
  idleMs: number
}

const MIN_MS = 60_000
const DEFAULT_IDLE_MIN = 15
const DEFAULT_INTERVAL_SEC = 60
const DEFAULT_ACTIVE_WINDOW_MIN = 30

export function defaultProjectsDir(): string {
  return path.join(os.homedir(), '.claude', 'projects')
}

/**
 * 메인 세션 jsonl 만 스캔 — projects/<proj>/<session>.jsonl (깊이 고정 2).
 * 하위폴더(subagents/·workflows/ 등)의 에이전트 로그는 메인 세션이 아니므로 제외.
 */
export function scanSessions(projectsDir: string): SessionInfo[] {
  let projDirs: fs.Dirent[]
  try {
    projDirs = fs.readdirSync(projectsDir, { withFileTypes: true }).filter((d) => d.isDirectory())
  } catch {
    return []
  }
  const sessions: SessionInfo[] = []
  for (const proj of projDirs) {
    const dir = path.join(projectsDir, proj.name)
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith('.jsonl')) continue
      const file = path.join(dir, e.name)
      let mtimeMs: number
      try {
        mtimeMs = fs.statSync(file).mtimeMs
      } catch {
        continue
      }
      sessions.push({ file, project: proj.name, sessionId: e.name.replace(/\.jsonl$/, ''), mtimeMs })
    }
  }
  return sessions
}

/**
 * 결정적 분류 — 스캔 결과 × 추적 상태(제자리 갱신) → 이벤트.
 * - 미추적 + 활성 윈도우 내 → 등록만(이벤트 없음). 윈도우 밖 옛 세션은 소음이라 무시.
 * - 추적 중 + mtime 전진 → 갱신, alerted 였으면 recovered + 재무장.
 * - 추적 중 + idle 초과 + 미알림 → stalled 1회 (재알림 금지).
 */
export function classify(
  sessions: SessionInfo[],
  state: WatchState,
  nowMs: number,
  idleMs: number,
  activeWindowMs: number,
): WatchEvent[] {
  const events: WatchEvent[] = []
  for (const s of sessions) {
    const tracked = state.get(s.file)
    if (!tracked) {
      if (nowMs - s.mtimeMs <= activeWindowMs) {
        state.set(s.file, { lastMtimeMs: s.mtimeMs, alerted: false })
      }
      continue
    }
    if (s.mtimeMs > tracked.lastMtimeMs) {
      const wasAlerted = tracked.alerted
      tracked.lastMtimeMs = s.mtimeMs
      tracked.alerted = false
      if (wasAlerted) events.push({ kind: 'recovered', session: s, idleMs: 0 })
      continue
    }
    const idle = nowMs - tracked.lastMtimeMs
    if (idle >= idleMs && !tracked.alerted) {
      tracked.alerted = true
      events.push({ kind: 'stalled', session: s, idleMs: idle })
    }
  }
  return events
}

export interface Notifier {
  name: string
  send(text: string): Promise<boolean>
}

/**
 * 텔레그램 알리미 — env VHK_TG_TOKEN + VHK_TG_CHAT_ID 필요(미설정 시 null = 콘솔 전용).
 * 발송 실패는 throw 하지 않고 false — 알림 채널이 죽어도 감시 루프는 살아야 한다.
 */
export function createTelegramNotifier(fetchFn: typeof fetch = fetch): Notifier | null {
  const token = process.env.VHK_TG_TOKEN
  const chatId = process.env.VHK_TG_CHAT_ID
  if (!token || !chatId) return null
  return {
    name: 'telegram',
    async send(text: string): Promise<boolean> {
      try {
        const res = await fetchFn(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text }),
        })
        return res.ok
      } catch {
        return false
      }
    },
  }
}

function fmtIdleMin(idleMs: number): number {
  return Math.round(idleMs / MIN_MS)
}

function eventText(ev: WatchEvent): string {
  const id8 = ev.session.sessionId.slice(0, 8)
  if (ev.kind === 'stalled') {
    return [
      '⚠️ [vhk watch] 세션 정지 감지',
      `프로젝트: ${ev.session.project}`,
      `세션: ${id8}`,
      `마지막 활동: ${fmtIdleMin(ev.idleMs)}분 전 (완료 또는 멈춤 — 확인 필요)`,
      `호스트: ${os.hostname()}`,
    ].join('\n')
  }
  return [
    '✅ [vhk watch] 세션 활동 재개',
    `프로젝트: ${ev.session.project}`,
    `세션: ${id8}`,
    `호스트: ${os.hostname()}`,
  ].join('\n')
}

/** fail-fast 숫자 파서 — 밤샘루프 사건 교훈: 잘못된 입력으로 조용히 기본값 폴백 금지. */
function parsePositive(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`--${name} 값이 잘못됨: "${raw}" (양수 필요)`)
  }
  return n
}

export interface WatchOptions {
  idleMin?: string
  interval?: string
  window?: string
  once?: boolean
  projectsDir?: string
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms))
}

export async function watch(opts: WatchOptions = {}): Promise<void> {
  console.log(chalk.bold(`\n${ko.watch.title}\n`))

  let idleMin: number
  let intervalSec: number
  let windowMin: number
  try {
    idleMin = parsePositive('idle-min', opts.idleMin, DEFAULT_IDLE_MIN)
    intervalSec = parsePositive('interval', opts.interval, DEFAULT_INTERVAL_SEC)
    windowMin = parsePositive('window', opts.window, DEFAULT_ACTIVE_WINDOW_MIN)
  } catch (e) {
    console.log(chalk.red(`  ❌ ${e instanceof Error ? e.message : String(e)}`))
    process.exitCode = 1
    return
  }
  const idleMs = idleMin * MIN_MS
  const windowMs = windowMin * MIN_MS
  const projectsDir = opts.projectsDir ?? defaultProjectsDir()

  const notifier = createTelegramNotifier()
  if (notifier) {
    console.log(chalk.dim(`  알림 채널: 텔레그램 (VHK_TG_TOKEN·VHK_TG_CHAT_ID 설정됨)`))
  } else {
    console.log(chalk.yellow('  ⚠️ 텔레그램 미설정 (VHK_TG_TOKEN·VHK_TG_CHAT_ID) — 콘솔 알림만 동작'))
  }
  console.log(chalk.dim(`  감시 대상: ${projectsDir}`))
  console.log(chalk.dim(`  기준: idle ${idleMin}분 · 폴링 ${intervalSec}초 · 활성 윈도우 ${windowMin}분\n`))

  const state: WatchState = new Map()

  const tick = async (): Promise<void> => {
    const now = Date.now()
    const sessions = scanSessions(projectsDir)
    const events = classify(sessions, state, now, idleMs, windowMs)
    for (const ev of events) {
      const text = eventText(ev)
      if (ev.kind === 'stalled') console.log(chalk.red(`  ${text.replace(/\n/g, '\n  ')}`))
      else console.log(chalk.green(`  ${text.replace(/\n/g, '\n  ')}`))
      if (notifier) {
        const ok = await notifier.send(text)
        if (!ok) console.log(chalk.yellow('  ⚠️ 텔레그램 발송 실패 (감시는 계속)'))
      }
    }
  }

  if (opts.once) {
    // 1회 점검 모드: 등록 즉시 판정까지 (이미 idle 인 활성 세션도 이번 호출에서 드러나야 함)
    const now = Date.now()
    const sessions = scanSessions(projectsDir)
    classify(sessions, state, now, idleMs, windowMs)
    const events = classify(sessions, state, now, idleMs, windowMs)
    console.log(chalk.dim(`  활성 세션(윈도우 ${windowMin}분 내): ${state.size}개 / 전체 ${sessions.length}개`))
    for (const [file, t] of state) {
      const s = sessions.find((x) => x.file === file)
      if (!s) continue
      const idle = fmtIdleMin(now - t.lastMtimeMs)
      const mark = t.alerted ? chalk.red(`정지 ${idle}분`) : chalk.green(`활동 ${idle}분 전`)
      console.log(`  - ${s.project} / ${s.sessionId.slice(0, 8)} · ${mark}`)
    }
    for (const ev of events.filter((e) => e.kind === 'stalled')) {
      if (notifier) await notifier.send(eventText(ev))
    }
    return
  }

  console.log(chalk.dim('  감시 시작 — 종료는 Ctrl+C\n'))
  // 첫 tick 은 등록만 일어난다(이벤트는 다음 tick 부터). 상주 폴링 루프.
  for (;;) {
    await tick()
    await sleep(intervalSec * 1000)
  }
}
