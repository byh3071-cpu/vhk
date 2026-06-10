import { describe, it, expect } from 'vitest'
import { renderSeoReportHtml, DEEP_LINKS } from '../src/commands/seo/report.js'
import type { SeoLatest } from '../src/commands/seo/types.js'

const full: SeoLatest = {
  version: 1,
  collectedAt: '2026-06-10T00:00:00Z',
  domain: 'example.com',
  index: { googleIndexed: 42, bingIndexed: 30, sitemapStatus: 'OK' },
  traffic: { impressions: 1000, clicks: 80, visitors: 500, pageviews: 1200 },
  revenue: { estimatedEarnings: 12.5, currency: 'USD', pageRpm: 3.1 },
  bing: { rank: 5, aiCitations: 7 },
}

describe('Goal 25: renderSeoReportHtml (무빌드 오프라인)', () => {
  it('4블록(색인/트래픽/수익/AEO) 포함', () => {
    const html = renderSeoReportHtml(full)
    expect(html).toContain('🔎 색인')
    expect(html).toContain('📈 트래픽')
    expect(html).toContain('💰 수익')
    expect(html).toContain('🤖 AEO')
  })

  it('외부 CDN 의존 0 (http(s) script/link src 없음)', () => {
    const html = renderSeoReportHtml(full)
    expect(/<script[^>]+src=/.test(html)).toBe(false)
    expect(/<link[^>]+href="https?:/.test(html)).toBe(false)
    expect(html).toContain('<style>') // 인라인 CSS
  })

  it('데이터 값 렌더(색인 수·수익)', () => {
    const html = renderSeoReportHtml(full)
    expect(html).toContain('42') // googleIndexed
    expect(html).toContain('12.5') // earnings
  })

  it('못하는 항목 ⚠️ 배지 + 딥링크(URL 검사·AdSense)', () => {
    const html = renderSeoReportHtml(full)
    expect(html).toContain('⚠️')
    expect(html).toContain(DEEP_LINKS.urlInspection)
    expect(html).toContain(DEEP_LINKS.adsense)
  })

  it('데이터 없는 항목은 — 폴백, 빙 AI 인용 없으면 딥링크', () => {
    const html = renderSeoReportHtml({ version: 1, collectedAt: 't', domain: 'x.com' })
    expect(html).toContain('—') // 빈 값 대시
    expect(html).toContain(DEEP_LINKS.bingAi) // AI 인용 미수집 → 딥링크
  })

  it('HTML escape — domain 의 특수문자 안전', () => {
    const html = renderSeoReportHtml({ version: 1, collectedAt: 't', domain: 'a<b>"&' })
    expect(html).not.toContain('a<b>"&')
    expect(html).toContain('&lt;b&gt;')
  })

  it('XSS 방어 — aiCitationsDeepLink 의 javascript: 스킴은 href 에서 차단(#)', () => {
    const html = renderSeoReportHtml({
      version: 1, collectedAt: 't', domain: 'x.com',
      bing: { aiCitationsDeepLink: 'javascript:alert(document.cookie)' },
    })
    expect(html).not.toContain('javascript:')
    expect(html).toContain('href="#"') // 비-http(s) 스킴 → 안전한 # 로 대체
  })

  it('정상 https 딥링크는 보존', () => {
    const html = renderSeoReportHtml({
      version: 1, collectedAt: 't', domain: 'x.com',
      bing: { aiCitationsDeepLink: 'https://bing.com/webmasters' },
    })
    expect(html).toContain('https://bing.com/webmasters')
  })
})
