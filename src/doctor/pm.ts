import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { readJsonFile } from '../lib/read-json.js'

// #175 — 프로젝트가 선택한 패키지 매니저 감지. doctor 가 사용 안 하는 PM 부재를 critical fail 로
// 처리하지 않도록(npm 프로젝트인데 pnpm 없음 = 정상) 선택 PM 을 판별한다.

export type SelectedPM = 'pnpm' | 'yarn' | 'npm'

// 순수: packageManager 필드(corepack) 우선 → 락파일 → 기본 npm. (테스트 가능 seam)
export function detectSelectedPM(input: {
  packageManager?: string
  hasPnpmLock: boolean
  hasYarnLock: boolean
}): SelectedPM {
  const declared = input.packageManager?.trim().toLowerCase().split('@')[0]
  if (declared === 'pnpm' || declared === 'yarn' || declared === 'npm') return declared
  if (input.hasPnpmLock) return 'pnpm'
  if (input.hasYarnLock) return 'yarn'
  return 'npm' // package-lock.json 또는 락파일 없음 → npm 기준선
}

// 실제 cwd 에서 package.json(packageManager) + 락파일을 읽어 선택 PM 판별(IO 래퍼).
export function readSelectedPM(cwd: string): SelectedPM {
  let packageManager: string | undefined
  try {
    packageManager = readJsonFile<{ packageManager?: string }>(join(cwd, 'package.json')).packageManager
  } catch {
    // package.json 없음/파싱 실패 → 락파일로만 판별
  }
  return detectSelectedPM({
    packageManager,
    hasPnpmLock: existsSync(join(cwd, 'pnpm-lock.yaml')),
    hasYarnLock: existsSync(join(cwd, 'yarn.lock')),
  })
}
