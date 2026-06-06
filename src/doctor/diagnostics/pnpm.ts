import type { Diagnostic, DoctorOptions, DiagDeps } from '../types.js'

// 패키지 매니저(pnpm) 진단.
export function diagPnpm(_opts: DoctorOptions, deps: DiagDeps): Diagnostic {
  const r = deps.run('pnpm', ['--version'])
  if (r.ok && r.out.trim()) {
    return { name: 'pnpm', status: 'ok', value: r.out.trim().split('\n')[0] }
  }
  return { name: 'pnpm', status: 'fail', value: '없음', advice: '설치: npm i -g pnpm' }
}
