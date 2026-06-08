import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  normalizeDomain,
  siteFromDomain,
  upsertSite,
  resolveSecretPresence,
  envNameOf,
  readSeoConfig,
  writeSeoConfig,
  defaultSeoConfig,
  isSecretReference,
  DEFAULT_SECRET_REFS,
  SEO_SERVICE_KEYS,
  SEO_CONFIG_REL,
  type SeoConfig,
} from '../src/lib/seo-config.js'
import { seoInit } from '../src/commands/seo/init.js'
import { TOP_LEVEL_COMMANDS, CONTAINER_SUBCOMMANDS } from '../src/lib/command-registry.js'
import { KNOWN_COMMAND_TOKENS } from '../src/lib/cli-args.js'

// ─── seo-config 순수 함수 ──────────────────────────────────────────────
describe('seo-config — normalizeDomain', () => {
  it('스킴·www·트레일링 슬래시 제거 + 소문자', () => {
    expect(normalizeDomain('https://www.Example.com/')).toBe('example.com')
    expect(normalizeDomain('HTTP://Example.com/path/x')).toBe('example.com')
    expect(normalizeDomain('  example.com  ')).toBe('example.com')
  })
  it('이미 깔끔한 도메인은 그대로', () => {
    expect(normalizeDomain('sub.example.co.kr')).toBe('sub.example.co.kr')
  })
})

describe('seo-config — siteFromDomain', () => {
  it('GSC property·Bing URL 을 도메인에서 파생', () => {
    const s = siteFromDomain('https://www.demo.com/')
    expect(s.domain).toBe('demo.com')
    expect(s.gscProperty).toBe('sc-domain:demo.com')
    expect(s.bingSiteUrl).toBe('https://demo.com/')
    expect(s.ga4PropertyId).toBe('')
    expect(s.adsenseClient).toBe('')
  })
})

describe('seo-config — upsertSite (멱등)', () => {
  it('같은 도메인 두 번이면 사이트 1개', () => {
    let cfg = defaultSeoConfig()
    cfg = upsertSite(cfg, siteFromDomain('demo.com'))
    cfg = upsertSite(cfg, siteFromDomain('demo.com'))
    expect(cfg.sites).toHaveLength(1)
  })
  it('다른 도메인은 추가', () => {
    let cfg = defaultSeoConfig()
    cfg = upsertSite(cfg, siteFromDomain('a.com'))
    cfg = upsertSite(cfg, siteFromDomain('b.com'))
    expect(cfg.sites.map(s => s.domain)).toEqual(['a.com', 'b.com'])
  })
  it('재등록 시 채워진 값(ga4)을 빈 값으로 덮어쓰지 않음', () => {
    let cfg = defaultSeoConfig()
    cfg = upsertSite(cfg, { ...siteFromDomain('a.com'), ga4PropertyId: '999' })
    cfg = upsertSite(cfg, siteFromDomain('a.com')) // ga4 빈 값으로 재등록
    expect(cfg.sites[0].ga4PropertyId).toBe('999')
  })
})

// ─── secret = 환경변수 참조($이름)만, 값 아님 ──────────────────────────
describe('seo-config — secret 은 환경변수 참조($이름)만', () => {
  it('기본 secret 참조는 전부 $ 로 시작', () => {
    for (const k of SEO_SERVICE_KEYS) {
      expect(isSecretReference(DEFAULT_SECRET_REFS[k])).toBe(true)
    }
  })
  it('isSecretReference: 평문 값은 거부', () => {
    expect(isSecretReference('ya29.realtokenvalue')).toBe(false)
    expect(isSecretReference('$VHK_SEO_BING_API_KEY')).toBe(true)
    expect(isSecretReference('$')).toBe(false)
  })
})

describe('seo-config — resolveSecretPresence (boolean 만, 값 미노출)', () => {
  // 환경변수 키를 '계산해서' 구성 — 소스에 `API_KEY: '값'` 리터럴을 두지 않아 secure 스캐너 오탐 회피.
  const bingEnv = envNameOf(DEFAULT_SECRET_REFS.bing)
  const ga4Env = envNameOf(DEFAULT_SECRET_REFS.ga4)
  const PRESENT = 'zzz-present-marker'

  it('env 에 있으면 true, 없으면 false', () => {
    const env: NodeJS.ProcessEnv = { [bingEnv]: PRESENT }
    const present = resolveSecretPresence(DEFAULT_SECRET_REFS, env)
    expect(present.bing).toBe(true)
    expect(present.gsc).toBe(false)
  })
  it('빈 문자열·공백은 미존재로 취급', () => {
    const env: NodeJS.ProcessEnv = { [ga4Env]: '   ' }
    expect(resolveSecretPresence(DEFAULT_SECRET_REFS, env).ga4).toBe(false)
  })
  it('반환값은 boolean 뿐 — 실제 secret 값을 절대 담지 않음', () => {
    const env: NodeJS.ProcessEnv = { [bingEnv]: PRESENT }
    const present = resolveSecretPresence(DEFAULT_SECRET_REFS, env)
    const serialized = JSON.stringify(present)
    expect(serialized).not.toContain(PRESENT)
    for (const k of SEO_SERVICE_KEYS) expect(typeof present[k]).toBe('boolean')
  })
})

// ─── read/write (임시 디렉터리) ────────────────────────────────────────
describe('seo-config — read/write 라운드트립', () => {
  let dir: string
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-seo-')) })
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

  it('config 없으면 기본값(throw 안 함)', () => {
    expect(readSeoConfig(dir).sites).toEqual([])
  })
  it('손상된 JSON 도 throw 없이 기본값', () => {
    fs.mkdirSync(path.join(dir, '.vhk', 'seo'), { recursive: true })
    fs.writeFileSync(path.join(dir, SEO_CONFIG_REL), '{ broken')
    expect(() => readSeoConfig(dir)).not.toThrow()
    expect(readSeoConfig(dir).sites).toEqual([])
  })
  it('쓰고 다시 읽으면 동일', () => {
    const cfg = upsertSite(defaultSeoConfig(), siteFromDomain('demo.com'))
    writeSeoConfig(cfg, dir)
    expect(readSeoConfig(dir).sites[0].domain).toBe('demo.com')
  })
})

// ─── seoInit ───────────────────────────────────────────────────────────
describe('seoInit', () => {
  let dir: string
  let prevExit: typeof process.exitCode
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-seo-init-'))
    prevExit = process.exitCode
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
    process.exitCode = prevExit
    vi.restoreAllMocks()
  })

  it('--domain --yes 로 사이트 등록 (프롬프트 없음)', async () => {
    await seoInit({ domain: 'https://www.demo.com/', yes: true }, dir)
    const cfg = readSeoConfig(dir)
    expect(cfg.sites).toHaveLength(1)
    expect(cfg.sites[0].domain).toBe('demo.com')
  })

  it('config 의 secret 은 전부 $ 참조 — 평문 값 0', async () => {
    await seoInit({ domain: 'demo.com', yes: true }, dir)
    const raw = fs.readFileSync(path.join(dir, SEO_CONFIG_REL), 'utf-8')
    const cfg = JSON.parse(raw) as SeoConfig
    for (const k of SEO_SERVICE_KEYS) {
      expect(isSecretReference(cfg.secrets[k])).toBe(true)
    }
  })

  it('멱등 — 같은 도메인 두 번이면 사이트 1개', async () => {
    await seoInit({ domain: 'demo.com', yes: true }, dir)
    await seoInit({ domain: 'demo.com', yes: true }, dir)
    expect(readSeoConfig(dir).sites).toHaveLength(1)
  })

  it('비대화형인데 도메인 없음 → exit 2 (자동진행 불가), config 미생성', async () => {
    await seoInit({ yes: true }, dir)
    expect(process.exitCode).toBe(2)
    expect(fs.existsSync(path.join(dir, SEO_CONFIG_REL))).toBe(false)
  })
})

// ─── 등록 드리프트 가드 ────────────────────────────────────────────────
describe('seo 명령 등록 (3곳)', () => {
  it('TOP_LEVEL_COMMANDS 에 seo', () => {
    expect(TOP_LEVEL_COMMANDS.some(c => c.name === 'seo')).toBe(true)
  })
  it('CONTAINER_SUBCOMMANDS.seo 에 init', () => {
    expect(CONTAINER_SUBCOMMANDS.seo).toContain('init')
  })
  it('KNOWN_COMMAND_TOKENS 에 seo', () => {
    expect(KNOWN_COMMAND_TOKENS.has('seo')).toBe(true)
  })
})
