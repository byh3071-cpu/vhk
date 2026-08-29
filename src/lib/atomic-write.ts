import {
  closeSync,
  linkSync,
  lstatSync,
  openSync,
  writeFileSync,
  renameSync,
} from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { removeFileSync } from './fs-remove.js'

// 같은 프로세스 내 temp 파일명 충돌 방지용 단조 증가 카운터.
// (process.pid 만으로는 동일 파일을 동시에 두 번 쓸 때 temp 경로가 겹쳐 마지막 쓰기로 오염될 수 있다.)
let writeCounter = 0

const RENAME_MAX_RETRIES = 5
const RENAME_RETRY_DELAY_MS = 10
const renameRetryWait = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT))

function isTransientRenameError(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === 'EPERM'
}

export function renameFileWithRetry(
  tmp: string,
  filePath: string,
  renameFile: typeof renameSync = renameSync,
): void {
  for (let retry = 0; ; retry += 1) {
    try {
      renameFile(tmp, filePath)
      return
    } catch (error) {
      if (!isTransientRenameError(error) || retry >= RENAME_MAX_RETRIES) throw error
      // Windows 에서 백신·인덱서가 대상 파일 핸들을 잠깐 잡는 구간만 흡수한다.
      // 선형 대기(총 150ms)와 횟수 상한으로 영구 권한 오류를 숨기지 않는다.
      Atomics.wait(renameRetryWait, 0, 0, RENAME_RETRY_DELAY_MS * (retry + 1))
    }
  }
}

/**
 * 원자적 파일 쓰기 — 같은 디렉터리의 temp 파일에 먼저 쓰고 `renameSync`(원자적 교체)로 옮긴다.
 *
 * 왜: 상태/캐시/리포트 파일을 `writeFileSync` 로 바로 덮어쓰면, 쓰기 도중 프로세스가 kill 되었을 때
 * 대상 파일이 부분 기록(손상)된다 → 다음 read/JSON.parse 가 실패. rename 은 (같은 볼륨에서) 원자적이라
 * 대상 파일은 "이전 내용" 또는 "완전한 새 내용" 둘 중 하나만 갖는다(손상 중간상태 없음).
 *
 * temp 파일명에 process.pid 와 카운터를 붙여 동시 실행 충돌을 피한다. Windows 의 일시적 EPERM 은
 * 짧게 재시도하고, 최종 실패 시 temp 를 정리한 뒤 원래 에러를 다시 던진다.
 */
export interface AtomicWriteOptions {
  /** 새 파일 권한. 생략하면 기존 파일 권한을 보존하고, 신규 파일은 일반 umask를 따른다. */
  mode?: number
}

export class AtomicCreateCleanupError extends Error {
  readonly targetPath: string
  readonly tempPath: string

  constructor(targetPath: string, tempPath: string, cause: unknown) {
    super(`파일은 생성됐지만 임시 파일을 정리하지 못했습니다: ${tempPath}`, { cause })
    this.name = 'AtomicCreateCleanupError'
    this.targetPath = targetPath
    this.tempPath = tempPath
  }
}

export function atomicWriteFile(
  filePath: string,
  data: string,
  options: AtomicWriteOptions = {},
): void {
  const tmp = join(dirname(filePath), `.${basename(filePath)}.tmp-${process.pid}-${writeCounter++}`)
  const existing = lstatSync(filePath, { throwIfNoEntry: false })
  const mode = options.mode
    ?? (existing?.isFile() && !existing.isSymbolicLink() ? existing.mode & 0o777 : 0o666)
  let ownsTemp = false
  try {
    // `wx`는 예측 가능한 temp 이름을 먼저 심어 둔 링크를 따라 쓰지 않고 안전하게 실패시킨다.
    // 호출부가 민감 파일에 0600을 지정할 수 있고, 일반 파일은 기존 권한/umask를 유지한다.
    const fd = openSync(tmp, 'wx', mode)
    ownsTemp = true
    try {
      writeFileSync(fd, data, { encoding: 'utf-8' })
    } finally {
      closeSync(fd)
    }
    renameFileWithRetry(tmp, filePath)
    ownsTemp = false
  } catch (err) {
    if (ownsTemp) {
      try {
        removeFileSync(tmp)
      } catch {
        /* temp 정리 실패는 무시 — 원래 에러를 던진다 */
      }
    }
    throw err
  }
}

// 완성된 temp 파일을 hard-link해, 이미 생긴 대상은 절대 덮어쓰지 않는 원자적 신규 생성.
export function atomicCreateFile(
  filePath: string,
  data: string,
  options: AtomicWriteOptions = {},
): boolean {
  if (lstatSync(filePath, { throwIfNoEntry: false }) !== undefined) return false
  const tmp = join(dirname(filePath), `.${basename(filePath)}.tmp-${process.pid}-${writeCounter++}`)
  let ownsTemp = false
  try {
    const fd = openSync(tmp, 'wx', options.mode ?? 0o666)
    ownsTemp = true
    try {
      writeFileSync(fd, data, { encoding: 'utf-8' })
    } finally {
      closeSync(fd)
    }
    try {
      linkSync(tmp, filePath)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'EEXIST') return false
      // copyFile(EXCL)은 덮어쓰기는 막지만 프로세스 중단 시 부분 target을 남길 수 있다.
      // 완성본만 보이게 하는 계약을 지키기 위해 hard-link 미지원 파일시스템은 fail-closed한다.
      throw error
    }
    let cleanupError: unknown
    for (let retry = 0; retry < 3; retry += 1) {
      try {
        removeFileSync(tmp)
        ownsTemp = false
        return true
      } catch (error) {
        cleanupError = error
      }
    }
    // 대상 생성은 끝났지만 temp 잔재까지 남았으면 성공으로 숨기지 않는다.
    ownsTemp = false
    throw new AtomicCreateCleanupError(filePath, tmp, cleanupError)
  } finally {
    if (ownsTemp) {
      try {
        removeFileSync(tmp)
      } catch {
        /* 원래 생성 결과나 오류를 보존한다. */
      }
    }
  }
}
