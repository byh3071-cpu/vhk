import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { readJsonFile } from './read-json.js'

export const GATES_CONFIG_PATH_REL = join('.vhk', 'gates.json')
export const GATES_SCHEMA_VERSION = 1

export const GATE_IDS = ['typecheck', 'lint', 'test', 'build', 'secure'] as const
export type GateId = (typeof GATE_IDS)[number]

export interface GateIntent {
  /** true면 해당 검사를 현재 프로젝트에 도입하지 않기로 명시한 상태다. */
  optional: boolean
  /** 도입/미도입 판단의 사람용 근거. 빈 사유는 유효한 선언으로 보지 않는다. */
  reason: string
}

export interface GatesConfig {
  schemaVersion: number
  gates: Partial<Record<GateId, GateIntent>>
}

function emptyGatesConfig(): GatesConfig {
  return { schemaVersion: GATES_SCHEMA_VERSION, gates: {} }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * `.vhk/gates.json`을 BOM-safe로 읽는다. 파일 부재·손상·미지원 버전은 빈 선언으로
 * 처리해, 잘못된 설정이 실제 미실행 게이트의 WARN을 조용히 숨기지 못하게 한다.
 */
export function readGatesConfig(cwd: string = process.cwd()): GatesConfig {
  const path = join(cwd, GATES_CONFIG_PATH_REL)
  if (!existsSync(path)) return emptyGatesConfig()

  try {
    const raw = readJsonFile<unknown>(path)
    if (!isRecord(raw) || raw.schemaVersion !== GATES_SCHEMA_VERSION || !isRecord(raw.gates)) {
      return emptyGatesConfig()
    }

    const gates: GatesConfig['gates'] = {}
    for (const id of GATE_IDS) {
      const candidate = raw.gates[id]
      if (!isRecord(candidate) || typeof candidate.optional !== 'boolean') continue
      if (typeof candidate.reason !== 'string' || candidate.reason.trim().length === 0) continue
      gates[id] = { optional: candidate.optional, reason: candidate.reason.trim() }
    }
    return { schemaVersion: GATES_SCHEMA_VERSION, gates }
  } catch {
    return emptyGatesConfig()
  }
}
