import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import chalk from 'chalk'
import { log } from '../../utils/logger.js'
import { atomicWriteFile } from '../../lib/atomic-write.js'
import { isInteractive } from '../../lib/interactive.js'
import { ensureNotHardStopped } from '../../lib/hard-stop-guard.js'
import { readSeoLatest, type SeoLatest } from './types.js'

/**
 * Goal 25: `vhk seo report` — latest.json → 무빌드 HTML 대시보드(4블록).
 *
 * 철학: ① latest.json 만 읽어 렌더(새 증거 안 만듦) ② 무빌드·무의존(외부 CDN/번들러 0, 인라인 CSS)
 *       ③ 오프라인 ④ 못하는 항목마다 ⚠️ 배지 + 딥링크. verify --report 무빌드 패턴 재사용.
 */
export const SEO_REPORT_REL = join('.vhk', 'seo', 'report.html')

// API 로 안 되는 항목 → ⚠️ + "여기서 직접 하기" 딥링크.
export const DEEP_LINKS = {
  urlInspection: 'https://search.google.com/search-console/inspect',
  adsense: 'https://www.google.com/adsense/',
  naver: 'https://searchadvisor.naver.com/',
  bingAi: 'https://www.bing.com/webmasters/',
} as const

// 입력이 문자열이 아닐 수 있음(손상/수동편집 latest.json) → String 강제로 esc(undefined) 크래시 방지.
// 타입은 base 값만(객체 미허용) — 런타임에 객체가 와도 String() 으로 안 죽고, lint(no-base-to-string)도 통과.
function esc(s: string | number | null | undefined): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** href 스킴 화이트리스트 — latest.json 의 외부 입력이 `javascript:` 등으로 XSS 되는 것을 차단. */
function safeHref(href: string | null | undefined): string {
  const h = String(href ?? '')
  return /^https?:\/\//i.test(h) ? h : '#'
}

function num(n: number | undefined, dash = '—'): string {
  return typeof n === 'number' ? String(n) : dash
}

/** ⚠️ 배지 + 딥링크 — API 로 못 가져오는 항목용. */
function warnBadge(label: string, href: string): string {
  return `<span class="warn">⚠️ ${esc(label)} — <a href="${esc(safeHref(href))}" target="_blank" rel="noopener">여기서 직접 하기</a></span>`
}

/**
 * latest.json → 오프라인 HTML(순수). 외부 CDN 의존 0(인라인 CSS), 4블록(색인/트래픽/수익/AEO).
 * 데이터 없는 항목은 ⚠️ 배지 + 딥링크 폴백.
 */
export function renderSeoReportHtml(latest: SeoLatest): string {
  const idx = latest.index ?? {}
  const tr = latest.traffic ?? {}
  const rev = latest.revenue ?? {}
  const bing = latest.bing ?? {}

  const aiCite =
    typeof bing.aiCitations === 'number'
      ? `빙 AI 인용: ${bing.aiCitations}`
      : warnBadge('빙 AI 인용 미수집', bing.aiCitationsDeepLink ?? DEEP_LINKS.bingAi)

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SEO 리포트 — ${esc(latest.domain)}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;max-width:880px;margin:2rem auto;padding:0 1rem;color:#1a1a1a;background:#fff}
  h1{font-size:1.4rem} h2{font-size:1.05rem;margin-top:1.6rem;border-bottom:1px solid #eee;padding-bottom:.3rem}
  .meta{color:#666;font-size:.85rem} .grid{display:flex;gap:1.2rem;flex-wrap:wrap}
  .card{flex:1;min-width:140px;background:#f7f7f8;border-radius:8px;padding:.8rem 1rem}
  .card b{display:block;font-size:1.3rem} .warn{color:#a15c00;background:#fff7e6;border-radius:6px;padding:.2rem .5rem;display:inline-block}
  a{color:#0b66c3}
</style></head><body>
<h1>📊 SEO·수익 리포트 — ${esc(latest.domain)}</h1>
<p class="meta">수집 시각: ${esc(latest.collectedAt)} · 무빌드 오프라인 리포트(외부 CDN 0)</p>

<h2>🔎 색인</h2>
<div class="grid">
  <div class="card"><b>${num(idx.googleIndexed)}</b>구글 색인</div>
  <div class="card"><b>${num(idx.bingIndexed)}</b>빙 색인</div>
  <div class="card"><b>${num(idx.naverIndexed)}</b>네이버 색인 ${typeof idx.naverIndexed === 'number' ? '' : warnBadge('네이버', DEEP_LINKS.naver)}</div>
</div>
<p class="meta">사이트맵: ${esc(idx.sitemapStatus ?? '—')} · URL 검사: ${warnBadge('개별 URL 색인 검사', DEEP_LINKS.urlInspection)}</p>

<h2>📈 트래픽</h2>
<div class="grid">
  <div class="card"><b>${num(tr.impressions)}</b>노출</div>
  <div class="card"><b>${num(tr.clicks)}</b>클릭</div>
  <div class="card"><b>${num(tr.visitors)}</b>방문자</div>
  <div class="card"><b>${num(tr.pageviews)}</b>페이지뷰</div>
</div>
<p class="meta">${aiCite}</p>

<h2>💰 수익 (AdSense v2, 읽기전용)</h2>
<div class="grid">
  <div class="card"><b>${num(rev.estimatedEarnings)}</b>추정 수익 ${esc(rev.currency ?? '')}</div>
  <div class="card"><b>${num(rev.pageRpm)}</b>페이지 RPM</div>
</div>
<p class="meta">광고 설정·조작: ${warnBadge('AdSense 설정 화면', DEEP_LINKS.adsense)}</p>

<h2>🤖 AEO 점검</h2>
<ul>
  <li>schema.org 구조화 데이터 — 수동 점검</li>
  <li>llms.txt 존재 — 수동 점검</li>
  <li>메타 태그(title/description/OG) — 수동 점검</li>
</ul>
</body></html>
`
}

export async function seoReport(opts: { open?: boolean; yes?: boolean } = {}, root: string = process.cwd()): Promise<void> {
  // 실전재검증 감사(2026-07-03) 발견 — #335/#336(seo init/submit)과 동일한 가드 누락 패턴의
  // 3번째 재발 후보였음. report.html 디스크 쓰기 전 차단(submit.ts·init.ts 와 동일하게 헤더보다 먼저).
  if (!ensureNotHardStopped('seo report')) return

  log.bold('\n🖥️  vhk seo report — 무빌드 HTML 대시보드\n')

  const latest = readSeoLatest(root)
  if (!latest) {
    log.warn('latest.json 이 없습니다. 먼저 `vhk seo check` 로 수집하세요.')
    process.exitCode = 1
    return
  }

  const html = renderSeoReportHtml(latest)
  mkdirSync(join(root, '.vhk', 'seo'), { recursive: true })
  atomicWriteFile(join(root, SEO_REPORT_REL), html)
  log.plain(chalk.green(`  ✓ 리포트 생성: ${SEO_REPORT_REL}`))

  // --open: 비대화형(CI/MCP)에선 자동 스킵.
  if (opts.open && isInteractive(opts)) {
    log.plain(chalk.dim('  · --open: 기본 브라우저 열기는 운영 단계에서 활성화(무인 배치 미수행).'))
  } else if (opts.open) {
    log.plain(chalk.dim('  · --open 무시(비대화형 — 자동 스킵).'))
  }
}
