import chalk from 'chalk'
import { log } from '../../utils/logger.js'
import { readSeoConfig, resolveSecretPresence, type SeoServiceKey } from '../../lib/seo-config.js'

/**
 * Goal 23·24: `vhk seo check` — 색인·트래픽(GSC+GA4) + 수익·빙(AdSense v2 + Bing) 수집 → latest.json.
 *
 * 무인 구현 범위: URL Inspection 한도 가드(순수) + 죽은 API 금지 가드(상수).
 * 실 수집(GSC searchanalytics/urlInspection·GA4 runReport·AdSense v2·Bing GetQueryStats)은
 * 자격증명 필요 → 미설정 시 정직 안내(blocker). latest.json 스키마/병합은 types.ts.
 *
 * 금지 API(가드): 구글 Indexing API(일반페이지 페널티)·AdSense v1.4(2021 종료)·UA·Custom Search(사망).
 */

export const ADSENSE_V14_FORBIDDEN = true // AdSense Management API v1.4 = 2021 종료. v2 만 사용.

// ── URL Inspection 한도 가드(순수) — 2,000/일 · 600/분. ──────────────────────────
export interface InspectionLimit {
  perDay: number
  perMin: number
}
export const URL_INSPECTION_LIMIT: InspectionLimit = { perDay: 2000, perMin: 600 }

/** 한도 내에서 추가 검사가 가능한가 — 초과 전 중단/배치용. */
export function canInspect(
  usedToday: number,
  usedThisMin: number,
  limit: InspectionLimit = URL_INSPECTION_LIMIT,
): boolean {
  return usedToday < limit.perDay && usedThisMin < limit.perMin
}

/** 남은 검사 가능 횟수(일·분 중 더 작은 쪽이 실질 한도). */
export function inspectionRemaining(
  usedToday: number,
  usedThisMin: number,
  limit: InspectionLimit = URL_INSPECTION_LIMIT,
): number {
  return Math.max(0, Math.min(limit.perDay - usedToday, limit.perMin - usedThisMin))
}

// ── 커맨드 핸들러 ──────────────────────────────────────────────────────────────

export async function seoCheck(_opts: { yes?: boolean } = {}, root: string = process.cwd()): Promise<void> {
  log.bold('\n📈 vhk seo check — 색인·트래픽·수익 수집\n')

  const cfg = readSeoConfig(root)
  if (cfg.sites.length === 0) {
    log.error('등록된 사이트가 없습니다. 먼저 `vhk seo init --domain <도메인>` 실행.')
    process.exitCode = 1
    return
  }

  const present = resolveSecretPresence(cfg.secrets)
  const collectors: { key: SeoServiceKey; label: string }[] = [
    { key: 'gsc', label: 'GSC 색인·검색성과' },
    { key: 'ga4', label: 'GA4 트래픽' },
    { key: 'adsense', label: 'AdSense v2 수익(읽기전용)' },
    { key: 'bing', label: 'Bing 순위·크롤·AI 인용' },
  ]

  log.plain(chalk.dim('  수집 대상(자격증명 존재 여부):'))
  for (const c of collectors) {
    const mark = present[c.key] ? chalk.green('✓') : chalk.dim('·')
    log.plain(`    ${mark} ${c.label}`)
  }
  log.plain(chalk.dim('  · 죽은 API 미사용: 구글 Indexing(일반페이지)·AdSense v1.4·UA·Custom Search'))

  const anyReady = collectors.some((c) => present[c.key])
  if (!anyReady) {
    log.warn('실 수집은 자격증명이 필요합니다 — 현재 전부 미설정.')
    log.plain(chalk.dim('    .env 에 $VHK_SEO_* 추가 후 재실행. (무인 배치 범위: 한도 가드·스키마·금지 API 가드)'))
    process.exitCode = 1
    return
  }
  log.warn('자격증명 일부 감지 — 단, 실 HTTP 수집 연동은 운영 단계에서 활성화됩니다(무인 배치 미수행).')
}
