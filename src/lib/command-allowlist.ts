/*
 * command-allowlist.ts — 실행 가능한 명령 허용목록 (작업 단위 125a-T1 · RFC 0067 §3).
 *
 * 셸 문자열도 패턴 매칭도 받지 않는다. **argv 토큰 배열의 정확 일치**다.
 * 매칭 로직이 배열 비교 한 줄이라 우회할 파서가 없다 — 셸 문자열을 받으면 인용·이스케이프·
 * 연쇄(`&&`·`;`·`|`)를 파싱해야 하고, 그 파서가 곧 우회 표면이 된다.
 * 접두사 일치(`pnpm *`)를 쓰면 `pnpm publish` 가 통과하는데 발행은 사람만 하는 일이다.
 *
 * 정확 일치의 비용은 유연성이다. `pnpm test:run --coverage` 를 쓰려면 항목을 하나 더 쓴다.
 * 그 비용을 받는다 — 허용목록은 실행 조건에 사람 손이 마지막으로 남는 자리다.
 *
 * **이 목록이 막는 것은 "무엇을 띄우는가" 이지 "무엇이 실행되는가" 가 아니다**(§3.4).
 * `pnpm typecheck` 는 통과하는데 `package.json` 의 스크립트 본문은 바꿀 수 있다.
 * 그 경로를 막을지는 §12 Q4 로 남아 있다. 허용목록은 **사람이 승인한 명령 이름**의 목록이지
 * 사람이 승인한 동작의 목록이 아니다.
 */
import { LEVELS, type PermissionLevel } from './permission-level.js'

/** 사람이 명시하지 않은 명령은 가장 높은 단계에서만 돈다 — fail-closed(중대 11). */
export const DEFAULT_MIN_LEVEL: PermissionLevel = 'L3'

export interface AllowEntry {
  /** 원장·출력에서 명령을 가리키는 안정 식별자. 파일 안에서 고유 */
  id: string
  /** 실행 파일 이름. 경로 구분자·상위 참조·drive prefix 금지 */
  bin: string
  /** **정확 일치 배열.** 빈 배열 허용. 와일드카드·정규식·변수 치환 없음 */
  args: string[]
  /** 이 명령을 돌리는 데 필요한 최소 권한 단계 */
  minLevel: PermissionLevel
  /** 이 명령 개별 상한(초). 없으면 `limits.perCommandSec` */
  maxDurationSec?: number
}

export interface AllowlistParse {
  /** 섹션이 유효한가. false 면 자율 레인 fail-closed */
  ok: boolean
  entries: AllowEntry[]
}

const INVALID = { ok: false, entries: [] as AllowEntry[] }

/**
 * 비교용 정규화 (§3.4).
 *
 * why 필요한가: `exec.ts` 의 `resolveCmd()` 가 Windows 에서 `pnpm` 을
 * `cmd.exe /d /s /c pnpm.cmd <args>` 로 재작성한다. 그 이후에 허용목록을 대면 모든 명령의
 * `bin` 이 `cmd.exe` 가 되므로 **집행 지점은 `resolveCmd` 이전**이고, 비교는
 * 소문자·확장자 제거·basename 기준이어야 한다.
 */
export function normalizeBin(bin: string): string {
  const base = bin.split(/[\\/]/).pop() ?? bin
  return base.replace(/\.[^.]+$/, '').toLowerCase()
}

function isValidBin(bin: unknown): bin is string {
  if (typeof bin !== 'string' || bin.length === 0) return false
  if (/[\\/]/.test(bin)) return false // 경로 구분자
  if (bin.includes('..')) return false // 상위 참조
  if (/^[a-zA-Z]:/.test(bin)) return false // drive prefix
  return true
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

/**
 * `allow` 섹션 파싱 (§3.3).
 *
 * **항목 하나만 무효여도 섹션 전체를 무효화한다.** 항목 단위로 버리면 "내가 쓴 3개 중 2개만
 * 살아 있는데 어느 것이 죽었는지 모르는" 상태가 된다 — 작업 단위 117 이 고친 실패 형태와 같다.
 */
export function parseAllowlist(raw: unknown): AllowlistParse {
  if (!Array.isArray(raw)) return INVALID

  const entries: AllowEntry[] = []
  const ids = new Set<string>()

  for (const item of raw) {
    if (typeof item !== 'object' || item === null) return INVALID
    const o = item as Record<string, unknown>

    if (typeof o.id !== 'string' || o.id.length === 0) return INVALID
    if (ids.has(o.id)) return INVALID // id 중복
    if (!isValidBin(o.bin)) return INVALID
    if (!isStringArray(o.args)) return INVALID

    let minLevel: PermissionLevel = DEFAULT_MIN_LEVEL
    if (o.minLevel !== undefined) {
      if (typeof o.minLevel !== 'string' || !(LEVELS as readonly string[]).includes(o.minLevel)) {
        return INVALID
      }
      minLevel = o.minLevel as PermissionLevel
    }

    let maxDurationSec: number | undefined
    if (o.maxDurationSec !== undefined) {
      if (typeof o.maxDurationSec !== 'number' || !Number.isFinite(o.maxDurationSec) || o.maxDurationSec <= 0) {
        return INVALID
      }
      maxDurationSec = o.maxDurationSec
    }

    ids.add(o.id)
    entries.push({ id: o.id, bin: o.bin, args: o.args, minLevel, maxDurationSec })
  }

  return { ok: true, entries }
}

/**
 * argv 토큰 정확 일치 (§3.1).
 *
 * 길이가 같고 모든 토큰이 같아야 한다. 인자가 하나라도 더 붙거나 빠지거나 순서가 다르면
 * 매칭되지 않는다. `args` 안의 `*` 는 리터럴이지 와일드카드가 아니다.
 */
export function matchAllowEntry(
  entries: readonly AllowEntry[],
  bin: string,
  args: readonly string[],
): AllowEntry | null {
  const target = normalizeBin(bin)
  for (const e of entries) {
    if (normalizeBin(e.bin) !== target) continue
    if (e.args.length !== args.length) continue
    if (e.args.every((a, i) => a === args[i])) return e
  }
  return null
}
