import { existsSync } from 'node:fs'
import { join } from 'node:path'

export type PackageManager = 'pnpm' | 'yarn' | 'npm'

// lockfile 기반 PM 감지(레포 루트). 기본 npm. (vhk 는 범용 도구라 pnpm 고정 금지)
export function detectPM(dir: string): PackageManager {
  if (existsSync(join(dir, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(dir, 'yarn.lock'))) return 'yarn'
  return 'npm'
}

// cwd 변경 없이 특정 worktree 디렉터리에 설치하는 명령(PM별 dir 지정 플래그가 다름).
export function installCommandFor(pm: PackageManager, targetPath: string): { cmd: string; args: string[] } {
  if (pm === 'yarn') return { cmd: 'yarn', args: ['--cwd', targetPath, 'install'] }
  if (pm === 'npm') return { cmd: 'npm', args: ['--prefix', targetPath, 'install'] }
  return { cmd: 'pnpm', args: ['--dir', targetPath, 'install'] }
}
