import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { atomicWriteFile } from './atomic-write.js'
import { stripBom } from './read-json.js'
import type { DiffCoverageResult } from './diff-coverage.js'
import type { CommitInfo } from './git-repo.js'

// #371: diff-cover 측정 결과 영속화 — 콘솔 휘발 → 커버리지 추세 분석 토대.
//
// 위치 결정(.vhk/events/diff-cover.jsonl):
//   evidence-ledger(.vhk/ledger.jsonl)·action-ledger(.vhk/events/ai-actions.jsonl) 와 동일한
//   "추적되는 증거 원장" 패턴을 따른다. recall-log 처럼 gitignore 하지 않는 이유 —
//   이 로그는 측정치(커버율·미커버 라인 수·SHA)만 담고 검색어/사적 경로 원문은 안 남긴다.
//   추세 분석(RFC0050 §5 미검증 변경 추세)에 레포 차원의 영속 가치가 있어 **추적**한다.
//   - .gitattributes: events/*.jsonl merge=union → 멀티PC 양쪽 append 분기 시 줄 보존.
//   - self-tracked.ts: .vhk/events/*.jsonl prefix 제외 → diff-cover 가 스스로 append 해도
//     getCommitInfo 의 dirty 판정에서 빠진다(자기참조 봉인, #315 와 동일 구조).
//
// best-effort: 로그 실패는 diff-cover 본 측정/출력을 절대 막지 않는다(advisory 도구).

export const DIFF_COVER_LOG_REL = join('.vhk', 'events', 'diff-cover.jsonl')

export interface DiffCoverLogEntry {
  /** ISO 타임스탬프(실행 시각) */
  ts: string
  /** 측정 기준 HEAD 전체 SHA. 비-git/커밋 0개 → null */
  sha: string | null
  /** 사람용 짧은 SHA(7자) */
  shortSha: string | null
  /** 측정 시 working tree dirty 여부(자기 산출 추적파일 제외 판정) */
  dirty: boolean | null
  /** 측정 대상 파일(레포 상대 posix 경로) */
  file: string
  /** 분모 — 실행가능 추가라인 수(inCoverage 시) */
  added: number
  /** 미검증(미커버) 추가라인 수 = uncoveredNew.length. 라인 원문은 남기지 않음(측정치만). */
  uncovered: number
  /** 커버율 = covered/added (added===0 → 1) */
  ratio: number
  /** 커버리지 리포트에 이 파일이 있었나(false = 테스트 미import → coarse) */
  inCoverage: boolean
}

/**
 * DiffCoverageResult + 커밋정보 → 파일별 로그 엔트리(순수, fs/시간 부수효과 0).
 * ts 는 호출부에서 주입(테스트 결정성). 파일 단위 1엔트리 — 추세 분석에 파일별 분해가 유용.
 */
export function buildDiffCoverEntries(
  result: DiffCoverageResult,
  commit: CommitInfo | null,
  ts: string
): DiffCoverLogEntry[] {
  return result.files.map((f) => ({
    ts,
    sha: commit?.sha ?? null,
    shortSha: commit?.shortSha ?? null,
    dirty: commit?.dirty ?? null,
    file: f.file,
    added: f.added,
    uncovered: f.uncoveredNew.length,
    ratio: f.ratio,
    inCoverage: f.inCoverage,
  }))
}

/**
 * .vhk/events/diff-cover.jsonl 파싱(JSONL). 파일 없음 → []. 손상 라인 skip. BOM-safe.
 * 최소 스키마(file:string, added:number) 검증 — 형태 안 맞는 줄은 무시.
 */
export function readDiffCoverLog(cwd: string): DiffCoverLogEntry[] {
  const p = join(cwd, DIFF_COVER_LOG_REL)
  if (!existsSync(p)) return []
  const out: DiffCoverLogEntry[] = []
  for (const line of stripBom(readFileSync(p, 'utf-8')).split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    try {
      const e = JSON.parse(t) as DiffCoverLogEntry
      if (e && typeof e.file === 'string' && typeof e.added === 'number') out.push(e)
    } catch {
      /* 손상 라인 skip — 원장이 한 줄 깨졌다고 죽지 않음 */
    }
  }
  return out
}

/**
 * 측정 엔트리들을 append(append-only). 원자적 쓰기(temp→rename — 쓰기 중 kill 에도 손상 방지).
 * 빈 배열이면 파일 미생성·0 반환(측정 대상 없을 때 churn 0).
 * @returns 추가한 줄 수.
 */
export function appendDiffCoverLog(cwd: string, entries: DiffCoverLogEntry[]): number {
  if (entries.length === 0) return 0
  const p = join(cwd, DIFF_COVER_LOG_REL)
  mkdirSync(join(cwd, '.vhk', 'events'), { recursive: true })
  const existing = existsSync(p) ? stripBom(readFileSync(p, 'utf-8')).replace(/\n*$/, '') : ''
  const body = (existing ? existing + '\n' : '') + entries.map((e) => JSON.stringify(e)).join('\n') + '\n'
  atomicWriteFile(p, body)
  return entries.length
}
