import { nodeMeetsShimSafe } from '../../lib/preflight.js'
import type { Diagnostic, DoctorOptions, DiagDeps } from '../types.js'

// Node 진단 — 두 가지를 본다:
// 1) PATH 의 node 가 셸에서 호출 가능한지 실측(옛 checkCommand 가드 복원 — nvm/volta 셸 미초기화 등 탐지)
// 2) 버전이 .cmd shim 안전(20.12+/21.7+)인지를 Goal 29 nodeMeetsShimSafe 로 오프라인 즉시 판정
// Phase 2: opts.online 이면 실제 CVE DB 보정.
export function diagNode(_opts: DoctorOptions, deps: DiagDeps): Diagnostic {
  const reach = deps.run('node', ['--version'])
  if (!reach.ok) {
    return {
      name: 'Node',
      status: 'fail',
      value: 'PATH 미인식',
      advice: 'node 가 PATH 에 없음 — 셸/환경변수(nvm·volta 초기화) 확인',
    }
  }
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
