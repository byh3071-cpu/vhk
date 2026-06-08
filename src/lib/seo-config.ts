import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { readJsonFile } from './read-json.js'
import { atomicWriteFile } from './atomic-write.js'

/**
 * SEO 에픽(Goal 21~26) 공용 설정 — `.vhk/seo/config.json`.
 *
 * 보안 불변규칙: 이 파일엔 **자격증명 값이 절대 들어가지 않는다.** secrets 는 환경변수
 * '참조 이름'($VHK_SEO_*)만 담는다(값은 .gitignore 된 .env 에). 그래서 config.json 은
 * 커밋해도 안전하고, 실제 키는 `vhk secure` 스캐너가 평문 유출을 감시한다.
 *
 * 패턴 출처: src/lib/config.ts (readConfig — 없으면 기본값·손상돼도 throw 안 함),
 *           src/lib/atomic-write.ts (원자적 쓰기), src/lib/read-json.ts (BOM 안전 파싱).
 */

export const SEO_DIR = join('.vhk', 'seo')
export const SEO_CONFIG_REL = join('.vhk', 'seo', 'config.json')
export const SEO_CONFIG_VERSION = 1

export interface SeoSite {
  /** 정규화된 도메인 (스킴·www·슬래시 제거). 예: example.com */
  domain: string
  /** GSC property — 도메인 속성. 예: sc-domain:example.com */
  gscProperty: string
  /** GA4 속성 ID (숫자). init 단계에선 빈 값, 후속 goal 에서 채움. */
  ga4PropertyId: string
  /** AdSense client (ca-pub-...). init 단계에선 빈 값. */
  adsenseClient: string
  /** Bing 사이트 URL (스킴 포함). 예: https://example.com/ */
  bingSiteUrl: string
}

export type SeoServiceKey = 'gsc' | 'ga4' | 'adsense' | 'bing' | 'indexnow'

/** 서비스별 자격증명의 환경변수 '참조 이름'($NAME). 값 아님. */
export type SeoSecrets = Record<SeoServiceKey, string>

export interface SeoConfig {
  version: number
  sites: SeoSite[]
  secrets: SeoSecrets
}

export const SEO_SERVICE_KEYS: readonly SeoServiceKey[] = [
  'gsc',
  'ga4',
  'adsense',
  'bing',
  'indexnow',
]

/** 5개 서비스 자격증명의 기본 환경변수 참조 이름. 실제 값은 .env 에 둔다. */
export const DEFAULT_SECRET_REFS: SeoSecrets = {
  gsc: '$VHK_SEO_GSC_SA_JSON',
  ga4: '$VHK_SEO_GA4_SA_JSON',
  adsense: '$VHK_SEO_ADSENSE_TOKEN',
  bing: '$VHK_SEO_BING_API_KEY',
  indexnow: '$VHK_SEO_INDEXNOW_KEY',
}

/** secret 항목이 '값'이 아니라 환경변수 '참조'($NAME)인지 — config 평문 유출 방지 가드. */
export function isSecretReference(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith('$') && value.length > 1
}

/** 참조($NAME) → 환경변수 이름(NAME). 이미 이름이면 그대로. */
export function envNameOf(ref: string): string {
  return ref.startsWith('$') ? ref.slice(1) : ref
}

export function defaultSeoConfig(): SeoConfig {
  return { version: SEO_CONFIG_VERSION, sites: [], secrets: { ...DEFAULT_SECRET_REFS } }
}

export function seoConfigPath(root: string = process.cwd()): string {
  return join(root, SEO_CONFIG_REL)
}

/** 도메인 정규화 — 스킴·www·경로/슬래시 제거, 소문자. */
export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
}

/** 도메인 하나로 사이트 레코드 생성 (GSC property·Bing URL 파생, 나머지는 빈 값). */
export function siteFromDomain(domain: string): SeoSite {
  const d = normalizeDomain(domain)
  return {
    domain: d,
    gscProperty: `sc-domain:${d}`,
    ga4PropertyId: '',
    adsenseClient: '',
    bingSiteUrl: `https://${d}/`,
  }
}

/**
 * 도메인 기준 사이트 upsert (멱등). 기존 도메인이면 병합하되 **새 값이 빈 문자열이면
 * 기존 채워진 값을 보존**(재등록이 ga4/adsense 등을 날리지 않게).
 */
export function upsertSite(cfg: SeoConfig, site: SeoSite): SeoConfig {
  const sites = [...cfg.sites]
  const idx = sites.findIndex(s => s.domain === site.domain)
  if (idx < 0) {
    sites.push(site)
    return { ...cfg, sites }
  }
  const merged: SeoSite = { ...sites[idx] }
  for (const k of Object.keys(site) as (keyof SeoSite)[]) {
    const next = site[k]
    if (next !== '' && next != null) merged[k] = next
  }
  sites[idx] = merged
  return { ...cfg, sites }
}

function isValidSite(s: unknown): s is SeoSite {
  return (
    typeof s === 'object' &&
    s !== null &&
    typeof (s as { domain?: unknown }).domain === 'string' &&
    (s as { domain: string }).domain.length > 0
  )
}

/** raw(부분) config → 안전한 완전한 config. 평문이 섞인 secret 은 기본 참조로 되돌림(유출 방지). */
function normalizeSeoConfig(raw: Partial<SeoConfig>): SeoConfig {
  const base = defaultSeoConfig()
  const sites = Array.isArray(raw.sites) ? raw.sites.filter(isValidSite) : []
  const secrets: SeoSecrets = { ...base.secrets }
  const rawSecrets = (raw.secrets ?? {}) as Partial<SeoSecrets>
  for (const k of SEO_SERVICE_KEYS) {
    const v = rawSecrets[k]
    // 참조($이름)면 채택, 아니면(평문·누락) 기본 참조 유지 — config 에 값이 들어오는 걸 막는다.
    secrets[k] = isSecretReference(v) ? (v as string) : base.secrets[k]
  }
  return {
    version: typeof raw.version === 'number' ? raw.version : base.version,
    sites,
    secrets,
  }
}

/**
 * config 읽기 — 없으면 기본값. 손상/파싱 실패해도 throw 하지 않는다(설정 깨졌다고 명령이 죽지 않게).
 * config.ts `readConfig` 와 동일 철학.
 */
export function readSeoConfig(root: string = process.cwd()): SeoConfig {
  const full = seoConfigPath(root)
  if (!existsSync(full)) return defaultSeoConfig()
  try {
    return normalizeSeoConfig(readJsonFile<Partial<SeoConfig>>(full))
  } catch {
    return defaultSeoConfig()
  }
}

/** config 쓰기 — `.vhk/seo/` 생성 후 원자적 쓰기. */
export function writeSeoConfig(cfg: SeoConfig, root: string = process.cwd()): void {
  mkdirSync(join(root, SEO_DIR), { recursive: true })
  atomicWriteFile(seoConfigPath(root), JSON.stringify(cfg, null, 2) + '\n')
}

/**
 * 각 서비스 자격증명이 환경에 존재하는지 — **boolean 만** 반환한다(값 절대 노출 금지).
 * 후속 goal(22+)이 "어떤 서비스가 실제로 동작 가능한가"를 판단할 때 쓴다.
 */
export function resolveSecretPresence(
  secrets: SeoSecrets,
  env: NodeJS.ProcessEnv = process.env,
): Record<SeoServiceKey, boolean> {
  const out = {} as Record<SeoServiceKey, boolean>
  for (const k of SEO_SERVICE_KEYS) {
    const v = env[envNameOf(secrets[k])]
    out[k] = typeof v === 'string' && v.trim().length > 0
  }
  return out
}
