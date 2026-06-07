import type { Diagnostic, DiagStatus } from './types.js'

export function diagIcon(status: DiagStatus): string {
  return status === 'ok' ? '🟢' : status === 'warn' ? '🟡' : status === 'fail' ? '🔴' : '⚪'
}

// 진단 결과 → 사람이 읽을 줄 목록(순수). non-ok 항목은 끝에 '권장 조치' 블록으로 모음.
export function formatDiagnostics(diags: Diagnostic[]): string[] {
  const lines: string[] = []
  for (const d of diags) {
    lines.push(`  ${diagIcon(d.status)} ${d.name.padEnd(8)} ${d.value}`)
  }
  const advices = diags.filter((d) => d.status !== 'ok' && d.advice)
  if (advices.length > 0) {
    lines.push('')
    lines.push('  권장 조치:')
    for (const d of advices) lines.push(`    - ${d.name}: ${d.advice}`)
  }
  return lines
}

// 기계가독(CI·MCP) 출력 — --json (Phase 2).
export function formatDiagnosticsJson(diags: Diagnostic[]): string {
  return JSON.stringify(diags, null, 2)
}
