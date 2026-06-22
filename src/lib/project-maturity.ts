import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { gitOut } from './git-repo.js'

/**
 * Goal 84: 레포가 "신규(온보딩 대상)" 인지 "기존(활성 작업 중)" 인지 판정 신호.
 *   doctor/status next-step 이 396커밋 활성 레포에도 "이제 프로젝트를 시작하세요" 온보딩을 뱉던 D9 해소용.
 */
export interface MaturitySignals {
  /** `.vhk/context.md` 존재 — vhk 를 이미 써온 흔적(맥락 파일 생성됨). */
  contextExists: boolean
  /** HEAD 까지 커밋 수. git 레포 아님/커밋 0 → 0. */
  commitCount: number
}

/** 이 값 이상의 커밋이면 "기존(활성) 레포". 초기 1~몇 커밋의 신규 레포와 구분. */
export const ESTABLISHED_COMMIT_THRESHOLD = 5

/**
 * 순수 분류 — 신호로 신규/기존 판정(IO 없음 → 테스트 용이).
 * context 흔적이 있거나 커밋이 임계 이상이면 기존, 아니면 신규.
 */
export function classifyMaturity(s: MaturitySignals): 'new' | 'established' {
  if (s.contextExists) return 'established'
  return s.commitCount >= ESTABLISHED_COMMIT_THRESHOLD ? 'established' : 'new'
}

/** cwd 에서 신호 수집(IO — git 통로는 기존 gitOut 재사용, 신규 execSync 없음). */
export function gatherMaturitySignals(cwd: string): MaturitySignals {
  const contextExists = existsSync(join(cwd, '.vhk', 'context.md'))
  let commitCount = 0
  try {
    const out = gitOut(['rev-list', '--count', 'HEAD'], cwd).trim()
    const n = Number.parseInt(out, 10)
    if (Number.isFinite(n)) commitCount = n
  } catch {
    /* 비-git/커밋 0 → 0 (신규로 취급) */
  }
  return { contextExists, commitCount }
}

/** 편의: cwd 를 직접 분류(수집 + 분류). */
export function projectMaturity(cwd: string): 'new' | 'established' {
  return classifyMaturity(gatherMaturitySignals(cwd))
}
