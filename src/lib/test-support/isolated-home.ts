/**
 * isolated-home.ts — 테스트용 홈 디렉터리 격리 (작업 단위 79)
 *
 * why: `loadCoreRuleset()` 은 인자 없이 불리면 `os.homedir()` 아래
 * `~/.vhk/config.json` 의 `rulesFile` 을 읽어 번들 스냅샷 대신 live 규칙 파일을 쓴다.
 * 개발 머신에는 그 설정이 있고 CI 체크아웃에는 없으므로, 번들 스냅샷 내용을 단언하는
 * 테스트가 CI 에서는 green 인데 로컬에서만 red 가 된다. 판정이 머신마다 갈리면
 * 로컬 게이트도 CI 게이트도 신뢰할 수 없다.
 *
 * `os.homedir()` 는 POSIX 에서 `HOME`, Windows 에서 `USERPROFILE` 환경변수를 우선
 * 참조한다(실측 확인). 둘 다 빈 임시 디렉터리로 덮으면 홈 설정이 있는 머신에서도
 * 번들 폴백 경로가 강제된다. `VHK_RULES_FILE` 은 그보다 우선순위가 높으므로 같이 지운다.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** `os.homedir()` 가 참조하는 환경변수 (POSIX · Windows) */
const HOME_ENV_KEYS = ['HOME', 'USERPROFILE'] as const

/** `loadCoreRuleset` 이 홈 설정보다 먼저 보는 환경변수 */
const OVERRIDE_ENV_KEYS = ['VHK_RULES_FILE'] as const

export type IsolatedHome = {
  /** 임시 홈 디렉터리 절대경로 */
  dir: string
  /** 환경변수를 원래대로 되돌리고 임시 디렉터리를 지운다 */
  restore: () => void
}

export function useIsolatedHome(prefix = 'vhk-isolated-home-'): IsolatedHome {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const saved = new Map<string, string | undefined>()

  for (const key of HOME_ENV_KEYS) {
    saved.set(key, process.env[key])
    process.env[key] = dir
  }
  for (const key of OVERRIDE_ENV_KEYS) {
    saved.set(key, process.env[key])
    delete process.env[key]
  }

  return {
    dir,
    restore() {
      for (const [key, value] of saved) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
      fs.rmSync(dir, { recursive: true, force: true })
    },
  }
}
