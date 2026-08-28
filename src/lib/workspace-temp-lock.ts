import { lstatSync, mkdirSync, realpathSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir, userInfo } from 'node:os'
import { join, resolve } from 'node:path'

function workspaceIdentity(cwd: string): string {
  let current: string
  try {
    current = realpathSync.native(cwd)
  } catch {
    current = resolve(cwd)
  }
  return process.platform === 'win32' ? current.toLowerCase() : current
}

function lockNamespaceDir(): string {
  const userIdentity = typeof process.getuid === 'function'
    ? `uid:${process.getuid()}`
    : `user:${userInfo().username}`
  const userKey = createHash('sha256').update(userIdentity).digest('hex').slice(0, 16)
  return join(tmpdir(), `vhk-workspace-locks-${userKey}`)
}

function ensureLockNamespace(dir: string): void {
  try {
    mkdirSync(dir, { mode: 0o700 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  const stat = lstatSync(dir, { throwIfNoEntry: false })
  const uidMismatch =
    typeof process.getuid === 'function'
    && stat !== undefined
    && stat.uid !== process.getuid()
  const broadPosixMode =
    process.platform !== 'win32'
    && stat !== undefined
    && (stat.mode & 0o077) !== 0
  if (
    stat === undefined
    || !stat.isDirectory()
    || stat.isSymbolicLink()
    || uidMismatch
    || broadPosixMode
  ) {
    const error = new Error('workspace 잠금 디렉터리의 소유권 또는 권한을 신뢰할 수 없습니다.') as NodeJS.ErrnoException
    error.code = 'WORKSPACE_LOCK_DIR_UNSAFE'
    throw error
  }
}

/** mutable Git·정책 상태와 무관한 사용자 전용 프로세스 간 잠금 경로. */
export function workspaceTempLockPath(cwd: string, purpose: string): string {
  if (!/^[a-z0-9-]+$/.test(purpose)) throw new Error('invalid workspace lock purpose')
  const namespace = lockNamespaceDir()
  ensureLockNamespace(namespace)
  const digest = createHash('sha256').update(workspaceIdentity(cwd)).digest('hex')
  return join(namespace, `${digest}.${purpose}.lock`)
}
