/*
 * run-state.ts — 자율 런 단위 상태 (작업 단위 125a-T4 · RFC 0067 §5.3-3).
 *
 * why 디스크에 영속하나: 명령 호출 수와 런 경과는 **프로세스 경계를 넘어** 누적돼야 한다.
 * 자율 런은 명령마다 새 프로세스를 띄우므로 메모리 카운터로는 셀 수 없다.
 *
 * why 잠금+CAS 인가: whole-file read-modify-write라 병행 런끼리 서로의 레코드를 지울 수 있다.
 * 배타 생성 잠금으로 프로세스 사이 갱신을 직렬화하고, `commandCount`의 base 비교도 유지해
 * 잠금을 기다리는 동안 낡아진 실행 판정은 통과시키지 않는다.
 *
 * 레코드를 `runId` 로 나누는 이유는 병행 런이 서로를 덮지 않게 하기 위해서다.
 */
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { readJsonFile } from './read-json.js'
import { ensurePolicyFilesIgnored } from './policy-files.js'
import { atomicWriteFile } from './atomic-write.js'
import { removeFileSync } from './fs-remove.js'
import { workspaceTempLockPath } from './workspace-temp-lock.js'
import {
  isExpectedRiskDecision,
  type ExpectedRiskDecision,
} from './policy-log.js'

export interface ExpectedTerminalRequest {
  ts: string
  event: 'complete' | 'hardstop' | 'blocked'
  /** 최초 종결 시도에서 정책 무효화가 이미 성립했는지. 재시도가 결과를 다시 계산하지 않게 고정한다. */
  policyInvalidated: boolean
  goal?: number
  ticks?: number
  interventions?: number
  reviewRejected?: boolean
  failureKind?: 'infra' | 'product'
}

export const RUN_STATE_REL = join('.vhk', 'run-state.json')
export const RUN_STATE_LOCK_REL = join('.vhk', 'run-state.lock')

const LOCK_RETRY_MS = 10
const LOCK_TIMEOUT_MS = 5_000
const lockWait = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT))
let lockCounter = 0

/** 종결 없이 남은 레코드가 이 시간을 넘기면 만료로 본다. */
export const RUN_STATE_TTL_SEC = 24 * 60 * 60

export interface RunRecord {
  startedAtUtc: string
  commandCount: number
  lastSeenUtc: string
  /** 한 번 켜지면 그 런은 끝난다 — 시계가 흔들린 런의 시간 한도를 더는 믿지 않는다 */
  clockAnomaly: boolean
  /** 런 시작 시 정책 내용 해시. 비추적 run-state에만 두며 공개 events 원장에는 쓰지 않는다. */
  policyConfigHash?: string
  /** 해시를 만든 시점. terminal 재시도가 공개 start 삭제로 legacy 강등되는 것을 막는다. */
  policySnapshotOrigin?: 'start-v1' | 'terminal-v1'
  /** terminal·정책 원장이 모두 내구화될 때까지 TTL prune에서 보호한다. */
  policyRecordPending?: boolean
  /** marker 도입 전에 이미 존재하던 unmarked terminal의 원장 보충 의무임을 구분한다. */
  policyRecordLegacyBackfill?: true
  /** 최초 terminal 시점의 완전한 risk 판정. 재시도는 현재 분류 규칙으로 다시 추정하지 않는다. */
  policyRiskExpected?: ExpectedRiskDecision
  /** terminal append 전 고정한 최초 종료 요청. 같은 runId의 다른 종료 종류가 선점하지 못하게 한다. */
  terminalRequestExpected?: ExpectedTerminalRequest
}

export type RunStateFile = Record<string, RunRecord>

export type RunRecordInspection =
  | { kind: 'missing' }
  | { kind: 'valid'; record: RunRecord }
  | { kind: 'corrupt'; scope: 'file' | 'record' }

function emptyRunState(): RunStateFile {
  // runId is external input. A null-prototype map keeps names such as `__proto__`
  // and `constructor` as ordinary records instead of inherited object members.
  return Object.create(null) as RunStateFile
}

function hasRunRecord(state: RunStateFile, runId: string): boolean {
  return Object.prototype.hasOwnProperty.call(state, runId)
}

function isUtcIso(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value))
}

function isOptionalNonNegativeInteger(value: unknown): boolean {
  return value === undefined || (Number.isSafeInteger(value) && (value as number) >= 0)
}

function isExpectedTerminalRequest(value: unknown): value is ExpectedTerminalRequest {
  if (typeof value !== 'object' || value === null) return false
  const o = value as Record<string, unknown>
  return (
    isUtcIso(o.ts)
    && (o.event === 'complete' || o.event === 'hardstop' || o.event === 'blocked')
    && typeof o.policyInvalidated === 'boolean'
    && isOptionalNonNegativeInteger(o.goal)
    && isOptionalNonNegativeInteger(o.ticks)
    && isOptionalNonNegativeInteger(o.interventions)
    && (o.reviewRejected === undefined || typeof o.reviewRejected === 'boolean')
    && (o.failureKind === undefined || o.failureKind === 'infra' || o.failureKind === 'product')
  )
}

function isRecord(v: unknown): v is RunRecord {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    isUtcIso(o.startedAtUtc)
    && Number.isSafeInteger(o.commandCount)
    && (o.commandCount as number) >= 0
    && isUtcIso(o.lastSeenUtc)
    && typeof o.clockAnomaly === 'boolean'
    && (
      o.policyConfigHash === undefined
      || (typeof o.policyConfigHash === 'string' && /^[a-f0-9]{64}$/.test(o.policyConfigHash))
    )
    && (
      o.policySnapshotOrigin === undefined
      || o.policySnapshotOrigin === 'start-v1'
      || o.policySnapshotOrigin === 'terminal-v1'
    )
    && (o.policySnapshotOrigin === undefined || typeof o.policyConfigHash === 'string')
    && (o.policyRecordPending === undefined || typeof o.policyRecordPending === 'boolean')
    && (o.policyRecordLegacyBackfill === undefined || o.policyRecordLegacyBackfill === true)
    && (o.policyRecordLegacyBackfill === undefined || o.policyRecordPending === true)
    && (o.policyRiskExpected === undefined || isExpectedRiskDecision(o.policyRiskExpected))
    && (o.policyRiskExpected === undefined || o.policyRecordPending === true)
    && (o.terminalRequestExpected === undefined || isExpectedTerminalRequest(o.terminalRequestExpected))
  )
}

/**
 * 한 runId의 raw 존재와 유효성을 구분한다. `readRunState()`의 관용적 skip만 쓰면 손상된
 * manual prepared record가 "없음"으로 보이고 현재 terminal 입력으로 재생성될 수 있다.
 */
export function inspectRunRecord(cwd: string, runId: string): RunRecordInspection {
  const p = join(cwd, RUN_STATE_REL)
  if (!existsSync(p)) return { kind: 'missing' }
  try {
    const parsed = readJsonFile<unknown>(p)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { kind: 'corrupt', scope: 'file' }
    }
    const raw = parsed as Record<string, unknown>
    if (!Object.prototype.hasOwnProperty.call(raw, runId)) return { kind: 'missing' }
    const record = raw[runId]
    return isRecord(record)
      ? { kind: 'valid', record: { ...record, clockAnomaly: record.clockAnomaly === true } }
      : { kind: 'corrupt', scope: 'record' }
  } catch {
    return { kind: 'corrupt', scope: 'file' }
  }
}

/** 파일 전체를 읽는다. 손상되면 빈 상태 — 판정 측이 "레코드 없음"으로 fail-closed 한다. */
export function readRunState(cwd: string): RunStateFile {
  const p = join(cwd, RUN_STATE_REL)
  if (!existsSync(p)) return emptyRunState()
  try {
    const parsed = readJsonFile<unknown>(p)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return emptyRunState()
    const out = emptyRunState()
    for (const [runId, rec] of Object.entries(parsed as Record<string, unknown>)) {
      if (isRecord(rec)) out[runId] = { ...rec, clockAnomaly: rec.clockAnomaly === true }
    }
    return out
  } catch {
    return emptyRunState()
  }
}

function write(cwd: string, state: RunStateFile): void {
  const p = join(cwd, RUN_STATE_REL)
  ensurePolicyFilesIgnored(cwd)
  mkdirSync(dirname(p), { recursive: true })
  atomicWriteFile(p, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
}

interface RunStateLock {
  fd: number
  path: string
  token: string
}

function errorCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error
    ? (error as NodeJS.ErrnoException).code
    : undefined
}

interface LockOwner {
  kind: 'owner'
  pid: number
  token: string
}

type LockObservation = LockOwner | { kind: 'malformed' } | { kind: 'missing' }

function observeLock(lockPath: string): LockObservation {
  let owner: unknown
  try {
    owner = readJsonFile<unknown>(lockPath)
  } catch (error) {
    const code = errorCode(error)
    if (code === 'ENOENT') return { kind: 'missing' }
    if (code !== undefined) return { kind: 'malformed' }
    owner = null
  }

  if (
    typeof owner === 'object'
    && owner !== null
    && 'pid' in owner
    && typeof owner.pid === 'number'
    && Number.isSafeInteger(owner.pid)
    && owner.pid > 0
    && 'token' in owner
    && typeof owner.token === 'string'
  ) {
    return { kind: 'owner', pid: owner.pid, token: owner.token }
  }

  return existsSync(lockPath) ? { kind: 'malformed' } : { kind: 'missing' }
}

function lockTimeoutError(lockPath: string, recoveryPath: string): NodeJS.ErrnoException {
  const observed = observeLock(lockPath)
  let owner = '잠금 소유 정보를 읽을 수 없습니다.'
  if (observed.kind === 'owner') {
    try {
      process.kill(observed.pid, 0)
      owner = `PID ${observed.pid} 프로세스가 잠금을 사용 중입니다.`
    } catch (error) {
      owner = errorCode(error) === 'ESRCH'
        ? `종료된 PID ${observed.pid}의 잠금이 남아 있습니다.`
        : `PID ${observed.pid}의 상태를 확인할 수 없습니다.`
    }
  } else if (observed.kind === 'missing') {
    owner = '대기 중 잠금이 사라졌습니다.'
  }
  const timeout = new Error(
    `run-state 잠금 획득 시간이 초과되었습니다. ${owner} `
    + `실행 중인 VHK 프로세스가 없는지 확인한 뒤 ${recoveryPath} 잠금을 사람이 직접 정리하세요. 자동 삭제하지 않습니다.`,
  ) as NodeJS.ErrnoException
  timeout.code = 'RUN_STATE_LOCK_TIMEOUT'
  return timeout
}

export function runStateCoordinationLockPath(cwd: string): string {
  // Git 초기화·worktree 전환·policy 생성은 런 도중 바뀔 수 있다. 그 상태로 위치를 고르면
  // 같은 workspace가 두 잠금 도메인으로 갈라지므로, 물리 cwd 해시 하나만 OS temp에 둔다.
  return workspaceTempLockPath(cwd, 'run-state')
}

interface RunStateLockOptions {
  ensureIgnored?: boolean
}

function acquireRunStateLock(cwd: string, options: RunStateLockOptions): RunStateLock {
  const ensureIgnored = options.ensureIgnored !== false
  if (ensureIgnored) ensurePolicyFilesIgnored(cwd)
  // 정책 파일은 런 도중 생기거나 사라질 수 있으므로 잠금 도메인은 그 mutable 상태와 무관해야 한다.
  // 모든 run-state/terminal 작업은 물리 cwd 해시의 같은 OS-temp 잠금을 공유한다.
  const lockPath = runStateCoordinationLockPath(cwd)
  const recoveryPath = lockPath
  const token = `${process.pid}-${Date.now()}-${lockCounter++}`
  const startedAt = Date.now()

  for (;;) {
    // 소유권이 불완전하거나 죽은 PID의 잠금도 자동 삭제하지 않는다. open('wx') 뒤 멈춘
    // 살아 있는 프로세스를 stale로 오판해 둘이 임계구역에 들어가는 것보다 수동 복구가 안전하다.
    try {
      const fd = openSync(lockPath, 'wx', 0o600)
      try {
        writeFileSync(fd, JSON.stringify({ pid: process.pid, token }))
      } catch (error) {
        closeSync(fd)
        removeFileSync(lockPath)
        throw error
      }
      return { fd, path: lockPath, token }
    } catch (error) {
      const code = errorCode(error)
      if (code !== 'EEXIST' && code !== 'EPERM') throw error
      if (Date.now() - startedAt >= LOCK_TIMEOUT_MS) {
        throw lockTimeoutError(lockPath, recoveryPath)
      }
      Atomics.wait(lockWait, 0, 0, LOCK_RETRY_MS)
    }
  }
}

function runStateCorruptError(): NodeJS.ErrnoException {
  const error = new Error('run-state contains malformed JSON or an invalid record') as NodeJS.ErrnoException
  error.code = 'RUN_STATE_CORRUPT'
  return error
}

/** 쓰기 전용 strict reader — 알 수 없는 raw 레코드를 skip한 상태로 파일 전체를 덮지 않는다. */
function readRunStateForMutation(cwd: string): RunStateFile {
  const p = join(cwd, RUN_STATE_REL)
  if (!existsSync(p)) return emptyRunState()
  let parsed: unknown
  try {
    parsed = readJsonFile<unknown>(p)
  } catch {
    throw runStateCorruptError()
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw runStateCorruptError()
  }
  const out = emptyRunState()
  for (const [runId, record] of Object.entries(parsed as Record<string, unknown>)) {
    if (!isRecord(record)) throw runStateCorruptError()
    out[runId] = { ...record, clockAnomaly: record.clockAnomaly === true }
  }
  return out
}

function releaseRunStateLock(lock: RunStateLock): void {
  closeSync(lock.fd)
  let owner: unknown
  try {
    owner = readJsonFile<unknown>(lock.path)
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      const lost = new Error('run-state lock disappeared before release') as NodeJS.ErrnoException
      lost.code = 'RUN_STATE_LOCK_OWNERSHIP_LOST'
      throw lost
    }
    throw error
  }
  if (
    typeof owner !== 'object'
    || owner === null
    || !('token' in owner)
    || owner.token !== lock.token
  ) {
    const lost = new Error('run-state lock ownership changed') as NodeJS.ErrnoException
    lost.code = 'RUN_STATE_LOCK_OWNERSHIP_LOST'
    throw lost
  }
  removeFileSync(lock.path)
}

export function withRunStateLock<T>(
  cwd: string,
  mutate: () => T,
  options: RunStateLockOptions = {},
): T {
  const lock = acquireRunStateLock(cwd, options)
  try {
    return mutate()
  } finally {
    releaseRunStateLock(lock)
  }
}

/** 만료된 레코드 제거 — 종결 없이 남은 것이 영원히 쌓이지 않게. */
export function pruneExpired(state: RunStateFile, nowUtc: string): RunStateFile {
  const now = Date.parse(nowUtc)
  const out = emptyRunState()
  for (const [runId, rec] of Object.entries(state)) {
    const age = (now - Date.parse(rec.lastSeenUtc)) / 1000
    if (
      rec.policyRecordPending === true
      || rec.terminalRequestExpected !== undefined
      || (Number.isFinite(age) && age <= RUN_STATE_TTL_SEC)
    ) {
      out[runId] = rec
    }
  }
  return out
}

/** 런 시작 — 레코드를 만든다. 이미 있으면 덮지 않는다(재시작이 카운터를 리셋하면 안 된다). */
export function startRun(
  cwd: string,
  runId: string,
  nowUtc: string,
  policyConfigHash?: string,
): RunRecord {
  return withRunStateLock(cwd, () => {
    const state = pruneExpired(readRunStateForMutation(cwd), nowUtc)
    const existing = hasRunRecord(state, runId) ? state[runId] : undefined
    if (existing) return existing
    const rec: RunRecord = {
      startedAtUtc: nowUtc,
      commandCount: 0,
      lastSeenUtc: nowUtc,
      clockAnomaly: false,
      policyConfigHash,
      policySnapshotOrigin: policyConfigHash === undefined ? undefined : 'start-v1',
    }
    state[runId] = rec
    write(cwd, state)
    return rec
  })
}

/**
 * 이미 `withRunStateLock` 안인 종결 경로 전용. 정책 원장 게이트와 무관하게 기존 private 런의
 * 최초 terminal 요청을 append 전에 고정한다. 레코드가 없을 때는 기본적으로 만들지 않고,
 * 정책 무효화를 먼저 겪은 start-less manual 종결만 호출자가 명시적으로 생성한다.
 */
export function ensureTerminalRequestSnapshotLocked(
  cwd: string,
  runId: string,
  terminalRequestExpected: ExpectedTerminalRequest,
  createIfMissing = false,
): RunRecord | undefined {
  const state = readRunStateForMutation(cwd)
  const existing = hasRunRecord(state, runId) ? state[runId] : undefined
  if (!existing) {
    if (!createIfMissing) return undefined
    const created: RunRecord = {
      startedAtUtc: terminalRequestExpected.ts,
      commandCount: 0,
      lastSeenUtc: terminalRequestExpected.ts,
      clockAnomaly: false,
      terminalRequestExpected,
    }
    state[runId] = created
    write(cwd, state)
    return created
  }
  if (existing.terminalRequestExpected !== undefined) return existing
  const updated: RunRecord = { ...existing, terminalRequestExpected }
  state[runId] = updated
  write(cwd, state)
  return updated
}

/**
 * 이미 `withRunStateLock` 안인 종결 경로 전용. manual/legacy terminal도 최초 정책 해시를
 * 비추적 상태에 고정해 append 실패 재시도가 나중 정책을 새 승인처럼 쓰지 못하게 한다.
 */
export function ensureTerminationPolicySnapshotLocked(
  cwd: string,
  runId: string,
  nowUtc: string,
  policyConfigHash: string,
  origin: 'start-v1' | 'terminal-v1',
  riskExpected: ExpectedRiskDecision,
  terminalRequestExpected: ExpectedTerminalRequest,
  createIfMissing = true,
  legacyBackfill = false,
): RunRecord | undefined {
  const state = readRunStateForMutation(cwd)
  const existing = hasRunRecord(state, runId) ? state[runId] : undefined
  if (existing) {
    const legacyEmpty =
      origin === 'terminal-v1'
      && existing.policyConfigHash === undefined
      && existing.policySnapshotOrigin === undefined
    const matching =
      existing.policyConfigHash === policyConfigHash
      && (
        existing.policySnapshotOrigin === origin
        || existing.policySnapshotOrigin === undefined
      )
    if (legacyEmpty || matching) {
      const pinnedRisk = existing.policyRiskExpected
      const pinnedTerminalRequest = existing.terminalRequestExpected
      // pending 이후 하나라도 유실된 상태는 현재 입력으로 수선하지 않는다. pending 전 request-only
      // pin은 정책 게이트와 독립된 정상 상태이므로, 이후 정책 기록이 필요해지면 그 request를 보존해
      // risk와 pending만 같은 쓰기로 보강한다.
      if (existing.policyRecordPending === true) return existing
      if (pinnedRisk !== undefined) return existing
      const updated: RunRecord = {
        ...existing,
        policyConfigHash,
        policySnapshotOrigin: origin,
        policyRecordPending: true,
        ...(legacyBackfill ? { policyRecordLegacyBackfill: true as const } : {}),
        policyRiskExpected: riskExpected,
        terminalRequestExpected: pinnedTerminalRequest ?? terminalRequestExpected,
      }
      state[runId] = updated
      write(cwd, state)
      return updated
    }
    return existing
  }
  if (!createIfMissing) return undefined
  const record: RunRecord = {
    startedAtUtc: nowUtc,
    commandCount: 0,
    lastSeenUtc: nowUtc,
    clockAnomaly: false,
    policyConfigHash,
    policySnapshotOrigin: origin,
    policyRecordPending: true,
    ...(legacyBackfill ? { policyRecordLegacyBackfill: true as const } : {}),
    policyRiskExpected: riskExpected,
    terminalRequestExpected,
  }
  state[runId] = record
  write(cwd, state)
  return record
}

/** 런 종결 — 레코드 제거. */
export function endRun(cwd: string, runId: string): void {
  // 정책 파일이 없던 런은 private 상태도 없다. 그 흔한 default-off 경로에서는 잠금·ignore 쓰기 0.
  const inspection = inspectRunRecord(cwd, runId)
  if (inspection.kind === 'missing') return
  if (inspection.kind === 'corrupt') throw runStateCorruptError()
  withRunStateLock(cwd, () => {
    const state = readRunStateForMutation(cwd)
    if (!hasRunRecord(state, runId)) return
    delete state[runId]
    write(cwd, state)
  })
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
  // 미시작 호출은 파일을 만들지 않고 즉시 fail-closed. 존재 확인 뒤 사라지는 경합은 잠금 안 재확인이 잡는다.
  const inspection = inspectRunRecord(cwd, runId)
  if (inspection.kind === 'missing') return { ok: false, conflict: false }
  if (inspection.kind === 'corrupt') throw runStateCorruptError()
  return withRunStateLock(cwd, () => {
    const state = readRunStateForMutation(cwd)
    const current = hasRunRecord(state, runId) ? state[runId] : undefined
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
  })
}
