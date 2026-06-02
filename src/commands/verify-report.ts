import type { GateResult, ReportStatus, VerifyReport } from './verify.js'

/**
 * Goal 14: verify 증거(latest.json) → 사람이 읽는 정적 HTML.
 * 철학: ① 새 증거 안 만듦(렌더만) ② 외부 의존 0(인라인 CSS, CDN/스크립트 없음) ③ 오프라인 동작
 *      ④ secret/env 미포함(latest.json 이 이미 미포함 — 그대로 렌더).
 * renderReportHtml 은 **순수 함수** — 파일 읽기/쓰기 없음(테스트 용이 + 단일 책임).
 */

/** HTML 특수문자 이스케이프 — detail/label/nextActions 의 사용자 텍스트 안전 렌더(태그 주입·깨짐 방지). */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 상태별 색상 토큰 (배지/표 셀 공용). 외부 폰트/리소스 없이 색상값만. */
const STATUS_COLOR: Record<ReportStatus, { bg: string; fg: string; label: string }> = {
  PASS: { bg: '#16a34a', fg: '#ffffff', label: 'PASS' },
  WARN: { bg: '#d97706', fg: '#ffffff', label: 'WARN' },
  FAIL: { bg: '#dc2626', fg: '#ffffff', label: 'FAIL' },
}

/** 게이트 상태(pass/fail/skip) → 한글 라벨 + 색상. */
const GATE_STATUS: Record<GateResult['status'], { color: string; label: string }> = {
  pass: { color: '#16a34a', label: '통과' },
  fail: { color: '#dc2626', label: '실패' },
  skip: { color: '#d97706', label: '건너뜀' },
}

function renderGateRow(g: GateResult): string {
  const s = GATE_STATUS[g.status]
  const exit = g.exitCode === null ? '—' : String(g.exitCode)
  const detail = g.detail ? escapeHtml(g.detail) : ''
  return `      <tr>
        <td class="gate-label">${escapeHtml(g.label)}</td>
        <td><span class="gate-status" style="color:${s.color}">${s.label}</span></td>
        <td class="gate-exit">${escapeHtml(exit)}</td>
        <td class="gate-detail">${detail}</td>
      </tr>`
}

/**
 * VerifyReport → 완성된 HTML 문자열. 외부 의존 0(인라인 <style>, 스크립트 없음).
 * @param report .vhk/reports/latest.json 의 파싱 결과(스키마 v1)
 */
export function renderReportHtml(report: VerifyReport): string {
  const c = STATUS_COLOR[report.status]
  const s = report.summary
  const rows = report.gates.map(renderGateRow).join('\n')
  const actions = report.nextActions
    .map((a) => `        <li>${escapeHtml(a)}</li>`)
    .join('\n')

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>vhk verify 리포트 — ${c.label}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 2rem 1rem;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif;
    background: #f8fafc; color: #0f172a; line-height: 1.55;
  }
  .wrap { max-width: 760px; margin: 0 auto; }
  header { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
  h1 { font-size: 1.25rem; margin: 0; font-weight: 700; }
  .badge {
    display: inline-block; padding: 0.35rem 1rem; border-radius: 9999px;
    font-weight: 800; font-size: 1rem; letter-spacing: 0.05em;
    background: ${c.bg}; color: ${c.fg};
  }
  .summary { color: #475569; font-size: 0.95rem; margin: 0.25rem 0 1.5rem; }
  .summary strong { color: #0f172a; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 1.75rem; font-size: 0.95rem; }
  th, td { text-align: left; padding: 0.6rem 0.75rem; border-bottom: 1px solid #e2e8f0; }
  th { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; }
  .gate-label { font-weight: 600; }
  .gate-status { font-weight: 700; }
  .gate-exit { font-variant-numeric: tabular-nums; color: #475569; }
  .gate-detail { color: #64748b; font-size: 0.88rem; }
  h2 { font-size: 1rem; margin: 0 0 0.5rem; }
  ul { margin: 0 0 1.75rem; padding-left: 1.25rem; }
  li { margin: 0.2rem 0; }
  footer { color: #94a3b8; font-size: 0.8rem; border-top: 1px solid #e2e8f0; padding-top: 0.75rem; }
  @media (prefers-color-scheme: dark) {
    body { background: #0f172a; color: #e2e8f0; }
    .summary { color: #94a3b8; } .summary strong { color: #e2e8f0; }
    th { color: #94a3b8; } th, td { border-color: #1e293b; }
    .gate-exit { color: #94a3b8; } .gate-detail { color: #94a3b8; }
    footer { color: #64748b; border-color: #1e293b; }
  }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>🔎 vhk verify 리포트</h1>
      <span class="badge">${c.label}</span>
    </header>
    <p class="summary">
      게이트 <strong>${s.total}</strong>개 — 통과 ${s.pass} / 실패 ${s.fail} / 건너뜀 ${s.skip}
    </p>
    <table>
      <thead>
        <tr><th>게이트</th><th>상태</th><th>종료코드</th><th>비고</th></tr>
      </thead>
      <tbody>
${rows}
      </tbody>
    </table>
    <h2>다음 행동</h2>
    <ul>
${actions}
    </ul>
    <footer>
      생성: ${escapeHtml(report.generatedAt)} · 날짜: ${escapeHtml(report.date)} · schema v${report.schemaVersion}
    </footer>
  </div>
</body>
</html>
`
}
