import { lstatSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

/*
 * 왜 fs.rmSync 를 쓰지 않나 (TS-005 / #353 / #441).
 *
 * Windows + Node v24 에서 rmSync 는 경로에 비ASCII 문자가 있으면 두 가지로 깨진다.
 *   - 경로 상위에 비ASCII: 프로세스가 exit 0xC0000409(STATUS_STACK_BUFFER_OVERRUN) 로 즉사.
 *     에러도 stderr 도 없어서 호출부의 try-catch 로 잡히지 않는다.
 *   - 이름 자체에 비ASCII: exit 0 인데 실제로는 삭제되지 않는다(조용한 실패).
 * Windows 사용자명이 한글이면 홈·임시 디렉터리 경로가 전부 여기 해당한다.
 *
 * unlink/rmdir 는 같은 경로에서 정상 동작하므로 재귀로 직접 내려간다.
 * 비동기 fs.promises.rm 도 정상이지만, 호출부가 전부 동기 CLI 경로라 동기 구현을 유지한다.
 */

/*
 * existsSync 가 아니라 lstat 를 쓰는 이유: existsSync 는 링크 대상을 따라가므로 깨진 심볼릭 링크에
 * false 를 준다. 그대로 조기 반환하면 rmSync(force) 는 지우는 링크가 남는다.
 * 또 확인과 삭제 사이에 다른 프로세스가 먼저 지우면 ENOENT 가 뜨는데, "없으면 통과" 계약상
 * 이건 성공이다. 다른 오류는 그대로 던져 실패를 숨기지 않는다.
 */

/** 대상이 (링크 자체 포함) 존재하는가. */
function exists(p: string): boolean {
  return lstatSync(p, { throwIfNoEntry: false }) !== undefined
}

/** 이미 사라진 경우만 삼킨다. */
function ignoreMissing(remove: () => void): void {
  try {
    remove()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

/** 파일 1개 삭제. 없으면 통과(rmSync 의 force 와 동등). 디렉터리면 던진다. */
export function removeFileSync(filePath: string): void {
  if (!exists(filePath)) return
  ignoreMissing(() => unlinkSync(filePath))
}

/** 디렉터리를 재귀 삭제. 없으면 통과. 파일·심볼릭 링크 경로가 오면 그것만 지운다. */
export function removeDirSync(dirPath: string): void {
  const stat = lstatSync(dirPath, { throwIfNoEntry: false })
  if (stat === undefined) return
  if (!stat.isDirectory()) {
    ignoreMissing(() => unlinkSync(dirPath))
    return
  }
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const child = join(dirPath, entry.name)
    // 심볼릭 링크는 대상을 따라가지 않고 링크 자체만 지운다.
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      removeDirSync(child)
    } else {
      ignoreMissing(() => unlinkSync(child))
    }
  }
  ignoreMissing(() => rmdirSync(dirPath))
}
