import type { Diagnostic, DoctorOptions } from '../types.js'

type AuditRun = () => { ok: boolean; out: string; err?: string }

// 의존성 보안 진단(Phase 2). 기본 생략(가볍게) — --audit 일 때만 PM audit 실행.
// 취약점 있으면 audit 가 exit≠0 → run.ok=false. 출력 파싱 대신 exit code 로 판정(견고).
export function buildAuditDiag(opts: DoctorOptions, run: AuditRun): Diagnostic {
  if (!opts.audit) {
    return { name: 'audit', status: 'skip', value: '생략 — --audit 로 실행' }
  }
  const r = run()
  if (r.ok) {
    return { name: 'audit', status: 'ok', value: '알려진 취약점 없음' }
  }
  return { name: 'audit', status: 'warn', value: '취약점 발견', advice: 'pnpm audit (또는 vhk audit --fix) 로 확인' }
}
