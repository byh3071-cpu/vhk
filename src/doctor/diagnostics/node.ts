import { nodeMeetsShimSafe } from '../../lib/preflight.js'
import type { Diagnostic, DoctorOptions, DiagDeps } from '../types.js'

// Node 진단 — 내장 권장 최소버전(20.12+/21.7+)으로 오프라인 즉시 판정.
// Goal 29 preflight 의 nodeMeetsShimSafe 재사용(이중 구현 금지).
// Phase 2: opts.online 이면 실제 CVE DB 보정.
export function diagNode(_opts: DoctorOptions, deps: DiagDeps): Diagnostic {
  const v = deps.nodeVersion
  if (nodeMeetsShimSafe(v)) {
    return { name: 'Node', status: 'ok', value: `${v} (shim-safe)` }
  }
  return {
    name: 'Node',
    status: 'warn',
    value: v,
    advice: 'Node 20.12+ / 21.7+ 권장 (.cmd shim CVE-2024-27980)',
  }
}
