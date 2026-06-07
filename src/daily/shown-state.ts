import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readJsonFile } from '../lib/read-json.js'
import { atomicWriteFile } from '../lib/atomic-write.js'

// Goal 32 Phase 3 — "오늘 아직 안 봤을 때만" 자동 브리핑(--if-stale)하기 위한 글로벌 상태.
//
// 여기 쓰는 ~/.vhk/ 는 version-check.json 과 같은 글로벌 디렉터리(프로젝트 무관 사용자 상태).
// 프로젝트 루트의 .vhk/(cwd 상대 — context/memory 등)와는 완전히 별개다.
//
// daily 모듈 공유 철학(standup↔today 코드/데이터 공유)에 맞춰, standup·today 가 한 파일을
// 키로 나눠 쓴다. today 자동실행은 Phase 3 후속이라 지금은 스키마만 예약하고 standup 만 사용.

export interface DailyShown {
  standup?: string // 마지막으로 standup 을 보여준 날짜 YYYY-MM-DD (KST)
  today?: string // 후속(today 자동실행)용 예약 키 — 현재 미사용
}

export type DailyShownKey = keyof DailyShown

/** 마지막으로 보여준 날짜와 오늘이 다르면(또는 기록 없음 null) 보여줄 차례. 순수(IO 0). */
export function shouldShow(lastShown: string | null, today: string): boolean {
  return lastShown !== today
}

export function getDailyShownPath(): string {
  return path.join(os.homedir(), '.vhk', 'daily-shown.json')
}

/** 상태 읽기. 없음/JSON 손상/스키마 불일치 → 빈 객체(자동 브리핑은 생략하고 정상 진행). */
export function readDailyShown(filePath: string = getDailyShownPath()): DailyShown {
  try {
    if (!fs.existsSync(filePath)) return {}
    const data = readJsonFile<Partial<DailyShown>>(filePath)
    if (!data || typeof data !== 'object') return {}
    const out: DailyShown = {}
    if (typeof data.standup === 'string') out.standup = data.standup
    if (typeof data.today === 'string') out.today = data.today
    return out
  } catch {
    return {}
  }
}

/**
 * 키별 "마지막 표시 날짜" 기록. ~/.vhk 없으면 생성, atomicWriteFile 로 원자적 교체.
 * 기존 다른 키는 보존한다. 쓰기 실패는 무시(부가기능이라 비치명 — version-check 캐시 선례).
 */
export function recordDailyShown(
  key: DailyShownKey,
  date: string,
  filePath: string = getDailyShownPath()
): void {
  try {
    const current = readDailyShown(filePath)
    current[key] = date
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    atomicWriteFile(filePath, JSON.stringify(current, null, 2))
  } catch {
    // 상태 쓰기 실패는 무시 — 자동 브리핑 정확도만 떨어질 뿐 기능 자체엔 영향 없음.
  }
}
