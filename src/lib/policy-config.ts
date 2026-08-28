/*
 * policy-config.ts — 권한 정책 설정 로더 (작업 단위 124-T4 전제 · RFC 0066 §7.4).
 *
 * 단일 규칙: **설정을 신뢰할 수 없으면 자율 레인 fail-closed(전부 거부) · 사람 CLI 무영향.**
 *
 * "off 폴백"·"집행 없음" 같은 표현을 쓰지 않는 이유는 그것이 "아무 일도 안 일어남" 으로
 * 읽히기 때문이다. 설정이 깨졌을 때 자율 레인이 조용히 예전처럼 도는 것은 안전한 상태가 아니다.
 * **깨지면 멈춘다.** 반대로 파일이 아예 없는 것은 손상이 아니라 기본 off 이며, 그때 자율 레인은
 * 종전대로 돈다 — 이 기능을 도입하지 않은 저장소를 멈춰세우지 않기 위해서다.
 *
 * 이 모듈은 읽기만 한다. 설정 파일을 만들지도, 고치지도 않는다 — `enforce` 를 켜는 CLI 명령을
 * 만들지 않는 규율(§7.4)과 같은 이유다. 사람이 편집기로 직접 쓴다.
 */
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseJsonText } from './read-json.js'
import { LEVELS, type PermissionLevel } from './permission-level.js'
import { parseAllowlist, type AllowEntry } from './command-allowlist.js'

export const POLICY_CONFIG_REL = join('.vhk', 'policy.json')
export const POLICY_SCHEMA_VERSION = 1

export type PolicyConfigReasonCode =
  | 'POLICY_CONFIG_UNREADABLE'
  | 'POLICY_CONFIG_UNSUPPORTED_VERSION'
  | 'POLICY_CONFIG_INVALID_FLAG'
  | 'POLICY_CONFIG_INVALID_MAX_LEVEL'

export interface PolicyConfig {
  /** 판정 이력을 원장에 남긴다. 집행은 하지 않는다(§7.1) */
  record: boolean
  /** 기록 + 집행. `record` 를 함의한다 */
  enforce: boolean
  /** 사람이 상한을 **낮출 때만** 쓴다. 올리는 경로는 없다 */
  maxLevel?: PermissionLevel
  /** 설정을 신뢰할 수 없다 → 자율 레인 전부 거부. 사람 CLI 는 영향 없음 */
  failClosed: boolean
  /** fail-closed 사유. 사람이 무엇을 고쳐야 하는지 알 수 있게 남긴다 */
  reasonCode?: PolicyConfigReasonCode

  // ── RFC 0067 §3.3 — allow·limits 섹션 ──

  /** 허용목록. 섹션이 무효면 빈 배열 */
  allow: AllowEntry[]
  /** 한도. 셋 다 필수이고 >0 이어야 한다 */
  limits?: ExecutionLimits
  /**
   * 자율 레인이 이 설정으로 돌 수 있는가.
   *
   * `failClosed` 와 구분한다 — 저건 세 키(record·enforce·maxLevel)를 못 읽은 상태이고,
   * 이건 **allow·limits 섹션이 쓸 수 없는 상태**다. 허용목록 항목 하나의 오타가 `enforce`
   * 해석까지 날리면 사람이 파일을 고치는 동안 무엇을 끈 건지 알 수 없다(§7.4 독립 파싱).
   * 다만 자율 레인의 결과는 어느 쪽이든 fail-closed 로 같다.
   */
  sectionsUsable: boolean
}

/** 한 번 읽은 동일 바이트에서 의미와 해시를 함께 만든 정책 설정 스냅샷. */
export interface PolicyConfigSnapshot {
  configPresent: boolean
  contentHash: string | null
  config: PolicyConfig
}

/** 런·명령 한도. 셋 다 필수다 — 안 쓰면 없어지는 게 아니라 못 돈다(치명 5). */
export interface ExecutionLimits {
  perRunSec: number
  perCommandSec: number
  perRunCommandCount: number
  /** 참고 지표. **판정에 쓰지 않는다** — 자기 보고라 하드리밋 근거가 못 된다(§5.5) */
  perRunUsd?: number
}

/** 신뢰할 수 없는 설정의 결과 — 플래그는 반드시 꺼진 값으로 준다. */
function blocked(reasonCode: PolicyConfigReasonCode): PolicyConfig {
  return {
    record: false,
    enforce: false,
    failClosed: true,
    reasonCode,
    allow: [],
    sectionsUsable: false,
  }
}

function defaultOff(): PolicyConfig {
  return { record: false, enforce: false, failClosed: false, allow: [], sectionsUsable: false }
}

/** 한도 파싱 — 셋 다 있어야 하고 전부 >0 이어야 한다. 하나라도 어긋나면 섹션 무효. */
function parseLimits(raw: unknown): ExecutionLimits | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const required = ['perRunSec', 'perCommandSec', 'perRunCommandCount'] as const
  const out: Record<string, number> = {}
  for (const key of required) {
    const v = o[key]
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null
    out[key] = v
  }
  const limits: ExecutionLimits = {
    perRunSec: out.perRunSec,
    perCommandSec: out.perCommandSec,
    perRunCommandCount: out.perRunCommandCount,
  }
  // 참고 지표 — 값이 이상해도 섹션을 무효화하지 않는다. 판정에 안 쓰기 때문이다.
  if (typeof o.perRunUsd === 'number' && Number.isFinite(o.perRunUsd)) {
    limits.perRunUsd = o.perRunUsd
  }
  return limits
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** 키가 없으면 false. 있는데 boolean 이 아니면 판단 불가 → null. */
function readFlag(raw: Record<string, unknown>, key: string): boolean | null {
  if (!(key in raw)) return false
  const v = raw[key]
  return typeof v === 'boolean' ? v : null
}

/**
 * `.vhk/policy.json` 을 읽는다.
 *
 * `record`·`enforce`·`maxLevel` 은 **독립 파싱**이다(§7.4). RFC 0067 의 `allow`·`limits`
 * 섹션이 깨져도 이 세 키의 해석은 살아 있어야 한다 — 허용목록 항목 하나의 오타가 `enforce`
 * 해석까지 날리면, 사람이 파일을 고치는 동안 "내가 무엇을 끈 건지" 알 수 없게 된다.
 * 그러면서도 어느 섹션이 깨지든 자율 레인의 결과는 fail-closed 로 같다.
 */
function parsePolicyConfig(parsed: unknown): PolicyConfig {
  if (!isRecord(parsed)) return blocked('POLICY_CONFIG_UNREADABLE')

  const version = parsed.schemaVersion
  if (version !== undefined && version !== POLICY_SCHEMA_VERSION) {
    return blocked('POLICY_CONFIG_UNSUPPORTED_VERSION')
  }

  const record = readFlag(parsed, 'record')
  const enforce = readFlag(parsed, 'enforce')
  if (record === null || enforce === null) return blocked('POLICY_CONFIG_INVALID_FLAG')

  let maxLevel: PermissionLevel | undefined
  if ('maxLevel' in parsed && parsed.maxLevel !== undefined) {
    const raw = parsed.maxLevel
    // L0~L3 밖은 "미설정" 이 아니라 판단 불가다(§7.4). 낙관 추정하지 않는다.
    if (typeof raw !== 'string' || !(LEVELS as readonly string[]).includes(raw)) {
      return blocked('POLICY_CONFIG_INVALID_MAX_LEVEL')
    }
    maxLevel = raw as PermissionLevel
  }

  // allow·limits 는 세 키와 **독립 파싱**이다(§7.4). 여기가 깨져도 record/enforce 해석은 살아 있다.
  const allowParse = parseAllowlist(parsed.allow ?? [])
  const limits = parseLimits(parsed.limits)
  const hasAllowSection = 'allow' in parsed
  // 자율 레인이 돌려면 유효한 허용목록 **과** 한도가 둘 다 있어야 한다.
  // 섹션이 아예 없는 것도 사용 불가다 — 빈 허용목록은 전부 거부이므로 돌 수 있는 명령이 없다.
  const sectionsUsable = allowParse.ok && hasAllowSection && allowParse.entries.length > 0 && limits !== null

  // 집행하면서 이력을 안 남기는 경로는 만들지 않는다(§7.1).
  return {
    record: record || enforce,
    enforce,
    maxLevel,
    failClosed: false,
    allow: allowParse.ok ? allowParse.entries : [],
    limits: limits ?? undefined,
    sectionsUsable,
  }
}

/**
 * 정책 파일을 한 번만 읽어 의미 파싱과 내용 해시를 같은 시점에 묶는다.
 * 읽기 실패는 파일 부재와 다르다. `configPresent:true` + fail-closed로 반환한다.
 */
export function readPolicyConfigSnapshot(cwd: string): PolicyConfigSnapshot {
  const p = join(cwd, POLICY_CONFIG_REL)
  let stat
  try {
    stat = lstatSync(p, { throwIfNoEntry: false })
  } catch {
    return {
      configPresent: true,
      contentHash: null,
      config: blocked('POLICY_CONFIG_UNREADABLE'),
    }
  }
  if (stat === undefined) {
    return { configPresent: false, contentHash: null, config: defaultOff() }
  }
  // 실제 경로 엔트리 부재만 default-off다. 링크·디렉터리·장치 파일은 읽을 수 없는
  // 정책으로 닫아, dangling link가 설정 삭제처럼 통과하는 경로를 만들지 않는다.
  if (!stat.isFile() || stat.isSymbolicLink()) {
    return {
      configPresent: true,
      contentHash: null,
      config: blocked('POLICY_CONFIG_UNREADABLE'),
    }
  }

  let raw: Buffer
  try {
    raw = readFileSync(p)
  } catch {
    return {
      configPresent: true,
      contentHash: null,
      config: blocked('POLICY_CONFIG_UNREADABLE'),
    }
  }

  const contentHash = createHash('sha256').update(raw).digest('hex')
  let parsed: unknown
  try {
    parsed = parseJsonText<unknown>(raw.toString('utf-8'))
  } catch {
    return {
      configPresent: true,
      contentHash,
      config: blocked('POLICY_CONFIG_UNREADABLE'),
    }
  }
  return { configPresent: true, contentHash, config: parsePolicyConfig(parsed) }
}

/** 기존 호출자의 공개 계약을 유지하는 스냅샷 wrapper. */
export function loadPolicyConfig(cwd: string): PolicyConfig {
  return readPolicyConfigSnapshot(cwd).config
}
