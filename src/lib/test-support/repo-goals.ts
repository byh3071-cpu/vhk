/**
 * repo-goals.ts — "실물 레포 goals/" 회귀 가드의 실행 조건 (작업 단위 112-T7)
 *
 * why: `goals/` 는 `.gitignore` 에 있어 CI 체크아웃에는 아예 없다. 그런데 실물 goals/ 를
 * 읽는 회귀 가드들은 디렉터리가 없으면 빈 결과를 비교하거나 "비적용 통과"로 빠져
 * **CI 에서 무조건 통과**한다. 판정력이 로컬에만 있는데 초록으로 보이는 것이 더 위험하다
 * (도그푸딩 #526 "차단이 로컬에서만"과 같은 형태).
 *
 * 그래서 그런 가드는 이 조건으로 `it.skipIf` 를 걸어 **건너뛴 사실이 보이게** 만든다.
 * 로직 자체의 판정력은 같은 파일의 픽스처 기반 케이스가 CI 에서도 유지한다.
 */

import { existsSync, readdirSync } from 'node:fs'

/** `<번호>-<슬러그>.md` 카드가 하나라도 있는 실물 goals 디렉터리인지. */
export function repoGoalsPresent(goalsDir = 'goals'): boolean {
  if (!existsSync(goalsDir)) return false
  try {
    return readdirSync(goalsDir).some((name) => /^\d+-.*\.md$/.test(name))
  } catch {
    // 권한·경합으로 못 읽으면 판정력이 없는 것과 같으므로 건너뛴다.
    return false
  }
}

/** 건너뛸 때 사람이 읽을 사유 — 테스트 제목에 붙여 쓴다. */
export const REPO_GOALS_SKIP_NOTE = '로컬 전용 — goals/ 는 비추적이라 CI 에는 없다'
