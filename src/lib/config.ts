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

/** Goal 56: 모델별 비용 요율(1k 토큰당 USD) — 코드 하드코딩 금지, config 주입. */
export interface PricingRate {
  inputPer1k: number
  outputPer1k: number
}

export interface VhkConfig {
  safetyMode: SafetyMode
  /** Goal 56: 비용 예산($) + warn 임계(기본 0.8). 미설정이면 비용 가드 없음. */
  budget?: { limitUsd?: number; warnPct?: number }
  /** Goal 56: 모델별 요율 주입(토큰→$ 환산용). */
  pricing?: Record<string, PricingRate>
}

export const DEFAULT_CONFIG: VhkConfig = { safetyMode: DEFAULT_SAFETY_MODE }

export function readConfig(rootDir: string = process.cwd()): VhkConfig {
  const full = join(rootDir, CONFIG_PATH)
  if (!existsSync(full)) return { ...DEFAULT_CONFIG }
  try {
    const raw = readJsonFile<Partial<VhkConfig>>(full)
    // Goal 56: budget/pricing 은 있을 때만 보존(없으면 키 자체를 안 둠 — 기존 안전모드-only 동작 불변).
    return {
      safetyMode: isSafetyMode(raw.safetyMode) ? raw.safetyMode : DEFAULT_CONFIG.safetyMode,
      ...(raw.budget && typeof raw.budget === 'object' ? { budget: raw.budget } : {}),
      ...(raw.pricing && typeof raw.pricing === 'object' ? { pricing: raw.pricing } : {}),
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
