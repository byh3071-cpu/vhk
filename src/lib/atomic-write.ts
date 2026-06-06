import { writeFileSync, renameSync, rmSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'

// 같은 프로세스 내 temp 파일명 충돌 방지용 단조 증가 카운터.
// (process.pid 만으로는 동일 파일을 동시에 두 번 쓸 때 temp 경로가 겹쳐 마지막 쓰기로 오염될 수 있다.)
let writeCounter = 0

/**
 * 원자적 파일 쓰기 — 같은 디렉터리의 temp 파일에 먼저 쓰고 `renameSync`(원자적 교체)로 옮긴다.
 *
 * 왜: 상태/캐시/리포트 파일을 `writeFileSync` 로 바로 덮어쓰면, 쓰기 도중 프로세스가 kill 되었을 때
 * 대상 파일이 부분 기록(손상)된다 → 다음 read/JSON.parse 가 실패. rename 은 (같은 볼륨에서) 원자적이라
 * 대상 파일은 "이전 내용" 또는 "완전한 새 내용" 둘 중 하나만 갖는다(손상 중간상태 없음).
 *
 * temp 파일명에 process.pid 를 붙여 동시 실행 충돌을 피한다. 실패 시 temp 를 정리하고 에러를 다시 던진다.
 */
export function atomicWriteFile(filePath: string, data: string): void {
  const tmp = join(dirname(filePath), `.${basename(filePath)}.tmp-${process.pid}-${writeCounter++}`)
  try {
    writeFileSync(tmp, data, 'utf-8')
    renameSync(tmp, filePath)
  } catch (err) {
    try {
      rmSync(tmp, { force: true })
    } catch {
      /* temp 정리 실패는 무시 — 원래 에러를 던진다 */
    }
    throw err
  }
}
