import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { atomicWriteFile } from './atomic-write.js'
import { stripBom } from './read-json.js'
import type { VerifyReport, ReportStatus } from '../commands/verify.js'
import type { AgentId } from './detect-agent.js'
import type { AiActionEntry } from './action-ledger.js'

// Goal 45: 증거 원장.
// latest.json 은 .vhk/reports/ → .vhk/.gitignore 로 휘발(로컬 전용). 그래서 레포만 보고
// "그 릴리즈가 증거 통과였나" 를 확인할 수 없었다. 이 원장은 요약 한 줄(JSONL)을 **git 추적되는**
// .vhk/ledger.jsonl 에 append 해, 증거 통과 상태를 레포에 영속으로 남긴다.
//
// 위치 결정: 카드의 'reports/ledger.jsonl' 대신 '.vhk/ledger.jsonl' — reports/ 는 디렉터리 통째
//   gitignore(+verify 의 ensureVhkIgnored 가 재삽입)라 그 안의 파일은 재추적이 불가능하다.
//   .vhk/ 루트는 ignore 대상이 아니라(특정 파일만 제외) ledger.jsonl 이 자연히 추적된다.

export const LEDGER_PATH_REL = join('.vhk', 'ledger.jsonl')
export const ADVISORY_ESCALATION_THRESHOLD = 3

export interface LedgerAdvisory {
  id: string
  message: string
}

export interface TrackedAdvisory extends LedgerAdvisory {
  firstSeenAt: string
  ageMs: number
  dismissCount: number
  dismissed: boolean
  escalated: boolean
}

export interface LedgerEntry {
  /** package.json version */
  version: string
  /** 사람용 날짜(localDate) */
  date: string
  /** 실제 증거 생성 시각. 선택 필드라 구버전 원장도 계속 읽힌다. */
  generatedAt?: string
  /** 게이트 종합 — PASS/WARN/FAIL */
  status: ReportStatus
  /** 증거가 묶인 커밋(Goal 44). git 레포 아님/커밋 0개 → null */
  sha: string | null
  shortSha: string | null
  dirty: boolean | null
  /**
   * RFC 0057 트랙②: 이 증거를 생성한 에이전트. 옵셔널 — 필드 추가 이전 과거 원장 라인(agent
   * 프로퍼티 자체 없음)을 읽어도 타입이 깨지지 않게(하위호환).
   */
  agent?: AgentId
  /** 이 증거에서 발견된 권고. 선택 필드라 구버전 원장도 계속 읽힌다. */
  advisories?: LedgerAdvisory[]
}

/**
 * VerifyReport + version → 원장 한 줄(순수 — 부수효과 0 유지). agent 기본값은 detectAgent() 호출이
 * 아니라 정적 리터럴 'unknown' — 실제 감지(env 읽기)는 호출부(commands/verify.ts)가 담당한다.
 */
export function buildLedgerEntry(report: VerifyReport, version: string, agent: AgentId = 'unknown'): LedgerEntry {
  return {
    version,
    date: report.date,
    generatedAt: report.generatedAt,
    status: report.status,
    sha: report.commit?.sha ?? null,
    shortSha: report.commit?.shortSha ?? null,
    dirty: report.commit?.dirty ?? null,
    agent,
    advisories: (report.advisories ?? []).map(({ id, message }) => ({ id, message })),
  }
}

function observationTime(entry: LedgerEntry): string | null {
  const candidate = entry.generatedAt ?? `${entry.date}T00:00:00.000Z`
  return Number.isFinite(Date.parse(candidate)) ? candidate : null
}

/** 현재 권고를 과거 증거·무시 행동과 합쳐 최초 발견 시각과 누적 무시를 계산한다. */
export function trackAdvisories(
  current: LedgerAdvisory[],
  history: LedgerEntry[],
  actions: AiActionEntry[],
  nowIso: string,
): TrackedAdvisory[] {
  const nowMs = Date.parse(nowIso)
  return current.map((advisory) => {
    let firstSeenAt = nowIso
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const observations = history[index].advisories
      // 구버전 줄은 권고 관측 여부를 알 수 없으므로 연속성 판정에서 건너뛴다.
      if (observations === undefined) continue
      if (!observations.some((item) => item.id === advisory.id)) break
      const observedAt = observationTime(history[index])
      if (observedAt) firstSeenAt = observedAt
    }

    const dismissals = actions.filter((entry) =>
      entry.action === 'advisory-dismiss' && entry.target === advisory.id && entry.ran,
    )
    const firstSeenMs = Date.parse(firstSeenAt)
    const latestDismissMs = dismissals.reduce((latest, entry) => {
      const timestamp = Date.parse(entry.ts)
      return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest
    }, Number.NEGATIVE_INFINITY)
    const ageMs = Number.isFinite(nowMs) && Number.isFinite(firstSeenMs)
      ? Math.max(0, nowMs - firstSeenMs)
      : 0

    return {
      ...advisory,
      firstSeenAt,
      ageMs,
      dismissCount: dismissals.length,
      dismissed: latestDismissMs >= firstSeenMs,
      escalated: dismissals.length >= ADVISORY_ESCALATION_THRESHOLD,
    }
  })
}

/** 권고 경과 시간을 짧고 안정적인 한국어로 표시한다. */
export function formatAdvisoryAge(ageMs: number): string {
  const hours = Math.floor(Math.max(0, ageMs) / (60 * 60 * 1000))
  if (hours < 1) return '방금'
  if (hours < 24) return `${hours}시간째`
  return `${Math.floor(hours / 24)}일째`
}

/** .vhk/ledger.jsonl 파싱(JSONL). 손상 라인은 관용적으로 skip(증거 원장이 한 줄 깨졌다고 죽지 않음). */
export function readLedger(cwd: string): LedgerEntry[] {
  const p = join(cwd, LEDGER_PATH_REL)
  if (!existsSync(p)) return []
  const out: LedgerEntry[] = []
  for (const line of stripBom(readFileSync(p, 'utf-8')).split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    try {
      out.push(JSON.parse(t) as LedgerEntry)
    } catch {
      /* 손상 라인 skip */
    }
  }
  return out
}

// 마지막 항목과 (version·sha·status·dirty) 동일하면 중복 — append 안 함(반복 verify 시 git churn 최소).
function sameAsLast(entries: LedgerEntry[], e: LedgerEntry): boolean {
  const last = entries[entries.length - 1]
  if (!last) return false
  const advisoryKey = (entry: LedgerEntry): string => JSON.stringify(
    (entry.advisories ?? []).map(({ id, message }) => ({ id, message })).sort((a, b) => a.id.localeCompare(b.id)),
  )
  return last.version === e.version && last.sha === e.sha && last.status === e.status &&
    last.dirty === e.dirty && advisoryKey(last) === advisoryKey(e)
}

/**
 * 원장에 한 줄 append(append-only). 직전 항목과 동일하면 skip.
 * 원자적 쓰기(temp→rename) — 쓰기 도중 kill 에도 원장 손상 방지(Goal 37 패턴).
 * @returns appended=false 면 중복이라 안 씀.
 */
export function appendLedgerEntry(cwd: string, entry: LedgerEntry): { appended: boolean } {
  const entries = readLedger(cwd)
  if (sameAsLast(entries, entry)) return { appended: false }
  const p = join(cwd, LEDGER_PATH_REL)
  mkdirSync(join(cwd, '.vhk'), { recursive: true })
  const existing = existsSync(p) ? stripBom(readFileSync(p, 'utf-8')).replace(/\n*$/, '') : ''
  const body = (existing ? existing + '\n' : '') + JSON.stringify(entry) + '\n'
  atomicWriteFile(p, body)
  return { appended: true }
}
