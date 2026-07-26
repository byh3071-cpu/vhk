import os from 'node:os'
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { readJsonFile } from './read-json.js'
import { atomicWriteFile } from './atomic-write.js'

// src/lib/config.ts(프로젝트-로컬 .vhk/config.json)와 달리 사용자별 규칙 파일 경로를 저장한다.

export interface VhkHomeConfig {
  rulesFile?: string
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

// 사용자가 명시적으로 저장한 값은 손상 시 복구 수단이 없으므로 임시파일+rename으로 기록한다.
export function writeHomeConfig(config: VhkHomeConfig, homeDir: string = os.homedir()): void {
  const p = getHomeConfigPath(homeDir)
  mkdirSync(path.dirname(p), { recursive: true })
  atomicWriteFile(p, JSON.stringify(config, null, 2))
}
