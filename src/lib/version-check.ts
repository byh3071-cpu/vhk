import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getVhkVersion } from './version.js'
import { readJsonFile } from './read-json.js'
import { safeExecFile, NETWORK_EXEC_TIMEOUT_MS } from './exec.js'

/**
 * 설치된 vhk 버전 업데이트 체크 — 글로벌 캐시 기반.
 *
 * 중요: 여기서 쓰는 ~/.vhk/ 는 프로젝트 루트의 .vhk/(cwd 상대, context/memory 등)와
 * 완전히 별개다. "설치된 vhk 가 최신인가"는 프로젝트 무관한 글로벌 관심사라 os.homedir()
 * 아래 단일 캐시로 둔다(프로젝트마다 npm view 반복 안 함).
 *
 * 메뉴(vhk no-arg)는 getUpdateInfo() 만 호출 — "가끔 자동 확인": 캐시가 신선하면 네트워크 0,
 * 24h 만료 시에만 1회 짧은 timeout(1.5s) 으로 npm view + 캐시 갱신, 실패는 1h 쿨다운으로 억제.
 */

export const PACKAGE_NAME = '@byh3071/vhk'
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h: 이보다 오래되면 stale
export const COOLDOWN_MS = 60 * 60 * 1000 // 1h: 조회 실패 후 재시도 억제(오프라인 폭주 방지)
export const MENU_FETCH_TIMEOUT_MS = 1500 // 메뉴 경로 npm view 짧은 timeout(메뉴 hang 방지)

// doctor.ts 에서 이동 — 메뉴/캐시/doctor/update 공용. timeoutMs 로 메뉴(짧게)·doctor(기본 30s) 구분.
export function fetchLatestNpmVersion(
  packageName: string,
  timeoutMs: number = NETWORK_EXEC_TIMEOUT_MS
): string | undefined {
  // safeExecFile 은 argv 분리 (packageName 의 shell metachar 인젝션 차단).
  const result = safeExecFile('npm', ['view', packageName, 'version'], { timeoutMs })
  if (!result.ok) return undefined
  const out = result.out
  if (/^\d+\.\d+\.\d+/.test(out)) return out
  return undefined
}

export function compareSemver(a: string, b: string): number {
  const parse = (v: string) =>
    v.replace(/^v/i, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0)
  const [a1 = 0, a2 = 0, a3 = 0] = parse(a)
  const [b1 = 0, b2 = 0, b3 = 0] = parse(b)
  if (a1 !== b1) return a1 - b1
  if (a2 !== b2) return a2 - b2
  return a3 - b3
}

export interface VersionCache {
  latest: string
  checkedAt: number // 성공 갱신 시각(Date.now())
  lastTriedAt?: number // 실패 포함 마지막 시도 시각(쿨다운용)
}

export interface UpdateInfo {
  current: string
  latest?: string
  updateAvailable: boolean
}

export function getCacheDir(): string {
  return path.join(os.homedir(), '.vhk')
}
export function getCachePath(): string {
  return path.join(getCacheDir(), 'version-check.json')
}

/** 캐시 읽기. 없음/JSON 손상/스키마 불일치 → null (메뉴는 알림만 생략하고 정상 진행). */
export function readCache(): VersionCache | null {
  try {
    const p = getCachePath()
    if (!fs.existsSync(p)) return null
    const data = readJsonFile<Partial<VersionCache>>(p)
    if (!data || typeof data.latest !== 'string' || typeof data.checkedAt !== 'number') {
      return null
    }
    return { latest: data.latest, checkedAt: data.checkedAt, lastTriedAt: data.lastTriedAt }
  } catch {
    return null
  }
}

/** 캐시 쓰기. ~/.vhk 없으면 생성. 실패는 조용히 무시(부가기능이라 비치명적). */
export function writeCache(cache: VersionCache): void {
  try {
    fs.mkdirSync(getCacheDir(), { recursive: true })
    fs.writeFileSync(getCachePath(), JSON.stringify(cache, null, 2), 'utf-8')
  } catch {
    // 캐시 쓰기 실패는 무시 — 알림 정확도만 떨어질 뿐 기능 자체엔 영향 없음.
  }
}

export function isStale(cache: VersionCache, now: number = Date.now()): boolean {
  return now - cache.checkedAt > CACHE_TTL_MS
}

/** doctor/update 가 이미 받은 latest 를 캐시에 적재(중복 npm view 0). */
export function recordLatest(latest: string, now: number = Date.now()): void {
  writeCache({ latest, checkedAt: now, lastTriedAt: now })
}

/**
 * 메뉴용 업데이트 정보 — "가끔 자동 확인".
 * 신선 캐시 → 네트워크 0. 만료 + 쿨다운 지남 → 1.5s npm view 1회 + 캐시 갱신.
 * 만료 + 쿨다운 내 → 이전 캐시값. 모든 경로에서 throw 없이 UpdateInfo 반환.
 * now 는 테스트 주입용.
 */
export function getUpdateInfo(now: number = Date.now()): UpdateInfo {
  const current = getVhkVersion()
  const cache = readCache()
  let latest: string | undefined

  if (cache && !isStale(cache, now)) {
    latest = cache.latest // 신선 → 네트워크 0
  } else {
    const lastTried = cache?.lastTriedAt ?? 0
    const cooledDown = now - lastTried > COOLDOWN_MS
    if (cooledDown) {
      const fetched = fetchLatestNpmVersion(PACKAGE_NAME, MENU_FETCH_TIMEOUT_MS)
      if (fetched) {
        writeCache({ latest: fetched, checkedAt: now, lastTriedAt: now })
        latest = fetched
      } else {
        // 조회 실패 — 쿨다운 기록 + 이전 값(있으면) 유지.
        if (cache) writeCache({ ...cache, lastTriedAt: now })
        latest = cache?.latest
      }
    } else {
      latest = cache?.latest // 쿨다운 내 — 네트워크 0, 이전 값
    }
  }

  const updateAvailable = latest ? compareSemver(latest, current) > 0 : false
  return { current, latest, updateAvailable }
}
