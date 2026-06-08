import type { Diagnostic, DoctorOptions, DiagDeps } from '../types.js'

// 패키지 매니저(pnpm) 진단.
// #175: pnpm 부재는 프로젝트가 pnpm 을 쓸 때만 critical fail. npm/yarn 프로젝트면 skip(선택 정보)
// 으로 처리해 exit 1 을 유발하지 않는다.
export function diagPnpm(_opts: DoctorOptions, deps: DiagDeps): Diagnostic {
  const r = deps.run('pnpm', ['--version'])
  if (r.ok && r.out.trim()) {
    return { name: 'pnpm', status: 'ok', value: r.out.trim().split('\n')[0] }
  }
  if (deps.selectedPM === 'pnpm') {
    return { name: 'pnpm', status: 'fail', value: '없음', advice: '설치: npm i -g pnpm (이 프로젝트는 pnpm 사용)' }
  }
  return { name: 'pnpm', status: 'skip', value: '미사용 (선택 사항)' }
}
