import type { Diagnostic, DoctorOptions, DiagDeps } from '../types.js'

// OS/셸 진단 — 진단만(항상 정보 표시).
export function diagOs(_opts: DoctorOptions, deps: DiagDeps): Diagnostic {
  return { name: 'OS', status: 'ok', value: `${deps.platform} ${deps.osRelease}` }
}
