/*
 * run-state.ts — 자율 런 단위 상태 (작업 단위 125a-T4 · RFC 0067 §5.3-3).
 *
 * why 디스크에 영속하나: 명령 호출 수와 런 경과는 **프로세스 경계를 넘어** 누적돼야 한다.
 * 자율 런은 명령마다 새 프로세스를 띄우므로 메모리 카운터로는 셀 수 없다.
 *
 * why CAS 인가: 이것은 read-modify-write 라 append 한 줄의 원자성이 적용되지 않는다.
 * RFC 0066 §4.5 의 관례를 그대로 쓴다 — 읽은 값을 base 로 기억하고, 기록 직전에 다시 읽어
 * `commandCount` 가 base 와 같을 때만 쓴다. 파일 잠금 없는 낙관적 방식이라 한계가 같다.
 * 막으려는 것은 **같은 런 안에서 순차로 도는 명령들의 누락**이지 극단적 동시 쓰기가 아니다.
 *
 * 레코드를 `runId` 로 나누는 이유는 병행 런이 서로를 덮지 않게 하기 위해서다.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { readJsonFile } from './read-json.js'

export const RUN_STATE_REL = join('.vhk', 'run-state.json')

/** 종결 없이 남은 레코드가 이 시간을 넘기면 만료로 본다. */
export const RUN_STATE_TTL_SEC = 24 * 60 * 60

export interface RunRecord {
  startedAtUtc: string
  commandCount: number
  lastSeenUtc: string
  /** 한 번 켜지면 그 런은 끝난다 — 시계가 흔들린 런의 시간 한도를 더는 믿지 않는다 */
  clockAnomaly: boolean
}

export type RunStateFile = Record<string, RunRecord>

function isRecord(v: unknown): v is RunRecord {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    typeof o.startedAtUtc === 'string'
    && typeof o.commandCount === 'number'
    && typeof o.lastSeenUtc === 'string'
  )
}

/** 파일 전체를 읽는다. 손상되면 빈 상태 — 판정 측이 "레코드 없음"으로 fail-closed 한다. */
export function readRunState(cwd: string): RunStateFile {
  const p = join(cwd, RUN_STATE_REL)
  if (!existsSync(p)) return {}
  try {
    const parsed = readJsonFile<unknown>(p)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const out: RunStateFile = {}
    for (const [runId, rec] of Object.entries(parsed as Record<string, unknown>)) {
      if (isRecord(rec)) out[runId] = { ...rec, clockAnomaly: rec.clockAnomaly === true }
    }
    return out
  } catch {
    return {}
  }
}

function write(cwd: string, state: RunStateFile): void {
  const p = join(cwd, RUN_STATE_REL)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, `${JSON.stringify(state, null, 2)}\n`, 'utf-8')
}

/** 만료된 레코드 제거 — 종결 없이 남은 것이 영원히 쌓이지 않게. */
export function pruneExpired(state: RunStateFile, nowUtc: string): RunStateFile {
  const now = Date.parse(nowUtc)
  const out: RunStateFile = {}
  for (const [runId, rec] of Object.entries(state)) {
    const age = (now - Date.parse(rec.lastSeenUtc)) / 1000
    if (Number.isFinite(age) && age <= RUN_STATE_TTL_SEC) out[runId] = rec
  }
  return out
}

/** 런 시작 — 레코드를 만든다. 이미 있으면 덮지 않는다(재시작이 카운터를 리셋하면 안 된다). */
export function startRun(cwd: string, runId: string, nowUtc: string): RunRecord {
  const state = pruneExpired(readRunState(cwd), nowUtc)
  const existing = state[runId]
  if (existing) return existing
  const rec: RunRecord = {
    startedAtUtc: nowUtc,
    commandCount: 0,
    lastSeenUtc: nowUtc,
    clockAnomaly: false,
  }
  state[runId] = rec
  write(cwd, state)
  return rec
}

/** 런 종결 — 레코드 제거. */
export function endRun(cwd: string, runId: string): void {
  const state = readRunState(cwd)
  if (!(runId in state)) return
  delete state[runId]
  write(cwd, state)
}

export interface BumpResult {
  ok: boolean
  /** CAS 충돌 — 그 사이 다른 프로세스가 카운터를 올렸다 */
  conflict: boolean
  record?: RunRecord
}

/**
 * 카운터 증가 (§5.3-3).
 *
 * **판정 통과 후 실제 실행 전에** 호출한다. 실행 후에 세면 프로세스가 죽었을 때 카운트가
 * 누락되고, 죽는 명령을 반복하는 루프가 카운터를 영원히 올리지 못한다.
 *
 * `baseCount` 는 판정 시점에 읽은 값이다. 기록 직전에 다시 읽어 같을 때만 쓴다(CAS).
 */
export function bumpCommandCount(
  cwd: string,
  runId: string,
  baseCount: number,
  nextLastSeenUtc: string,
  clockAnomaly: boolean,
): BumpResult {
  const state = readRunState(cwd)
  const current = state[runId]
  if (!current) return { ok: false, conflict: false } // 런 시작을 안 거친 호출
  if (current.commandCount !== baseCount) return { ok: false, conflict: true }

  const updated: RunRecord = {
    ...current,
    commandCount: baseCount + 1,
    lastSeenUtc: nextLastSeenUtc,
    clockAnomaly: current.clockAnomaly || clockAnomaly,
  }
  state[runId] = updated
  write(cwd, state)
  return { ok: true, conflict: false, record: updated }
}
