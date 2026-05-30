import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readJsonFile } from './read-json.js'
import { type SafetyMode, DEFAULT_SAFETY_MODE, isSafetyMode } from './safety-mode.js'

/**
 * .vhk/config.json — 프로젝트별 VHK 설정(로컬). 현재는 safetyMode 만.
 * 파일이 없으면 항상 기본값(standard)으로 동작 — 읽기는 절대 throw 하지 않는다.
 */
export const CONFIG_DIR = '.vhk'
export const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

export interface VhkConfig {
  safetyMode: SafetyMode
}

export const DEFAULT_CONFIG: VhkConfig = { safetyMode: DEFAULT_SAFETY_MODE }

export function readConfig(rootDir: string = process.cwd()): VhkConfig {
  const full = join(rootDir, CONFIG_PATH)
  if (!existsSync(full)) return { ...DEFAULT_CONFIG }
  try {
    const raw = readJsonFile<Partial<VhkConfig>>(full)
    return {
      safetyMode: isSafetyMode(raw.safetyMode) ? raw.safetyMode : DEFAULT_CONFIG.safetyMode,
    }
  } catch {
    // 손상/파싱 실패 → 기본값. 설정 깨졌다고 명령이 죽지 않게.
    return { ...DEFAULT_CONFIG }
  }
}

export function writeConfig(config: VhkConfig, rootDir: string = process.cwd()): void {
  mkdirSync(join(rootDir, CONFIG_DIR), { recursive: true })
  writeFileSync(join(rootDir, CONFIG_PATH), JSON.stringify(config, null, 2) + '\n', 'utf-8')
}
