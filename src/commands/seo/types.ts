import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { readJsonFile } from '../../lib/read-json.js'
import { atomicWriteFile } from '../../lib/atomic-write.js'

/**
 * SEO 수집 SoT — `.vhk/seo/latest.json` (Goal 23·24 수집 → Goal 25 렌더).
 * verify latest.json 패턴 재사용: 단일 진실원천, readJsonFile(BOM 안전), atomicWriteFile.
 * 본 배치는 **스키마 + I/O + 병합**만 무인 구현. 실 API 수집은 자격증명 필요(blocker).
 */
export const SEO_LATEST_REL = join('.vhk', 'seo', 'latest.json')
export const SEO_LATEST_VERSION = 1

/** 색인 블록 — 구글/빙/네이버 색인 수 + 사이트맵 상태. */
export interface SeoIndexBlock {
  googleIndexed?: number
  bingIndexed?: number
  naverIndexed?: number
  sitemapStatus?: string
  notIndexedUrls?: string[]
}

/** 트래픽 블록 — GSC 검색성과 + GA4. */
export interface SeoTrafficBlock {
  impressions?: number
  clicks?: number
  avgPosition?: number
  visitors?: number
  sessions?: number
  pageviews?: number
}

/** 수익 블록 — AdSense v2(읽기전용). */
export interface SeoRevenueBlock {
  estimatedEarnings?: number
  currency?: string
  pageRpm?: number
}

/** 빙 블록 — 순위·크롤 + AI 인용(베스트에포트). */
export interface SeoBingBlock {
  rank?: number
  crawled?: number
  aiCitations?: number
  /** AI Performance Report API 미가용 시 딥링크 폴백 표시. */
  aiCitationsDeepLink?: string
}

export interface SeoLatest {
  version: number
  collectedAt: string
  domain: string
  index?: SeoIndexBlock
  traffic?: SeoTrafficBlock
  revenue?: SeoRevenueBlock
  bing?: SeoBingBlock
}

export function emptyLatest(domain: string, collectedAt: string): SeoLatest {
  return { version: SEO_LATEST_VERSION, collectedAt, domain }
}

export function seoLatestPath(root: string = process.cwd()): string {
  return join(root, SEO_LATEST_REL)
}

/** latest.json 읽기 — 없거나 손상 시 null(명령이 죽지 않음). */
export function readSeoLatest(root: string = process.cwd()): SeoLatest | null {
  const p = seoLatestPath(root)
  if (!existsSync(p)) return null
  try {
    return readJsonFile<SeoLatest>(p)
  } catch {
    return null
  }
}

/** latest.json 쓰기 — 원자적. */
export function writeSeoLatest(latest: SeoLatest, root: string = process.cwd()): void {
  mkdirSync(join(root, '.vhk', 'seo'), { recursive: true })
  atomicWriteFile(seoLatestPath(root), JSON.stringify(latest, null, 2) + '\n')
}

/**
 * latest 병합(Goal 24 의 revenue/bing 섹션 병합 패턴) — 순수.
 * 얕은 섹션 병합 + collectedAt 갱신. prev 없으면 patch 가 곧 결과.
 */
export function mergeLatest(prev: SeoLatest | null, patch: Partial<SeoLatest>, collectedAt: string): SeoLatest {
  const base: SeoLatest = prev ?? { version: SEO_LATEST_VERSION, collectedAt, domain: patch.domain ?? '' }
  return {
    ...base,
    ...patch,
    version: SEO_LATEST_VERSION,
    collectedAt,
    domain: patch.domain ?? base.domain,
    index: { ...base.index, ...patch.index },
    traffic: { ...base.traffic, ...patch.traffic },
    revenue: { ...base.revenue, ...patch.revenue },
    bing: { ...base.bing, ...patch.bing },
  }
}
