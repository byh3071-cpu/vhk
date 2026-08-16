import { existsSync, lstatSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs'
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

/** 파일 1개 삭제. 없으면 통과(rmSync 의 force 와 동등). 디렉터리면 던진다. */
export function removeFileSync(filePath: string): void {
  if (!existsSync(filePath)) return
  unlinkSync(filePath)
}

/** 디렉터리를 재귀 삭제. 없으면 통과. 파일 경로가 오면 파일로 지운다. */
export function removeDirSync(dirPath: string): void {
  if (!existsSync(dirPath)) return
  if (!lstatSync(dirPath).isDirectory()) {
    unlinkSync(dirPath)
    return
  }
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const child = join(dirPath, entry.name)
    // 심볼릭 링크는 대상을 따라가지 않고 링크 자체만 지운다.
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      removeDirSync(child)
    } else {
      unlinkSync(child)
    }
  }
  rmdirSync(dirPath)
}
