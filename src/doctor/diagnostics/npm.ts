import type { Diagnostic, DoctorOptions, DiagDeps } from '../types.js'

// npm 진단 — vhk 의 publish(2FA)·업데이트 체크(npm view)·전역 설치가 npm 에 의존하므로
// 부재는 fail(옛 doctor 의 필수 4대 점검 복원). pnpm 진단과 별개로 둔다.
export function diagNpm(_opts: DoctorOptions, deps: DiagDeps): Diagnostic {
  const r = deps.run('npm', ['--version'])
  if (r.ok && r.out.trim()) {
    return { name: 'npm', status: 'ok', value: r.out.trim().split('\n')[0] }
  }
  return {
    name: 'npm',
    status: 'fail',
    value: '없음',
    advice: 'Node.js 재설치 또는 PATH 확인 (publish·업데이트가 npm 의존)',
  }
}
