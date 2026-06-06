import type { Diagnostic, DoctorOptions, DiagDeps } from '../types.js'

// git 진단 — 설치 + user.name/email 설정 여부.
export function diagGit(_opts: DoctorOptions, deps: DiagDeps): Diagnostic {
  const ver = deps.run('git', ['--version'])
  if (!ver.ok) {
    return { name: 'git', status: 'fail', value: '없음', advice: '설치: https://git-scm.com' }
  }
  const v = ver.out.trim().replace(/^git version /, '')
  const name = deps.run('git', ['config', 'user.name'])
  const email = deps.run('git', ['config', 'user.email'])
  const configured = name.ok && name.out.trim() !== '' && email.ok && email.out.trim() !== ''
  if (configured) {
    return { name: 'git', status: 'ok', value: `${v} (user configured)` }
  }
  return {
    name: 'git',
    status: 'warn',
    value: v,
    advice: 'git config user.name / user.email 설정 권장',
  }
}
