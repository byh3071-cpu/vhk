import os from 'node:os'
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { readJsonFile } from './read-json.js'
import { atomicWriteFile } from './atomic-write.js'

// goal 92 — YOHAN_BRAIN_ROOT 환경변수는 프로세스가 시작할 때만 읽혀 설정 직후 같은 세션엔
// 반영이 안 된다(Windows 재시작 필요). 이 파일은 매 실행마다 디스크를 새로 읽어 그 문제를
// 구조적으로 피한다. src/lib/config.ts(프로젝트-로컬 .vhk/config.json)와는 다른 개념이라
// 이름을 분리했다 — 여긴 홈 디렉터리(~/.vhk/config.json), 사용자 1명당 1개.

export interface VhkHomeConfig {
  rulesFile?: string
  /** @deprecated v2.12 호환 전용. v3.0에서 제거. */
  brainRoot?: string
}

export function getHomeConfigPath(homeDir: string = os.homedir()): string {
  return path.join(homeDir, '.vhk', 'config.json')
}

/** 손상/미존재 → null (조용한 폴백 — 호출부인 core-rules.ts 가 다음 우선순위로 넘어간다). */
export function readHomeConfig(homeDir: string = os.homedir()): VhkHomeConfig | null {
  try {
    return readJsonFile<VhkHomeConfig>(getHomeConfigPath(homeDir))
  } catch {
    return null
  }
}

// atomicWriteFile 사용(이 코드베이스 지배적 관례, 21개 파일) — brainRoot 는 사용자가 명시적으로
// 1회 설정한 값이라 손상 시 복구 수단이 없어, 캐시류(version-check.ts)의 raw writeFileSync
// 관례를 안 따르고 임시파일+rename 방식을 쓴다.
export function writeHomeConfig(config: VhkHomeConfig, homeDir: string = os.homedir()): void {
  const p = getHomeConfigPath(homeDir)
  mkdirSync(path.dirname(p), { recursive: true })
  atomicWriteFile(p, JSON.stringify(config, null, 2))
}
