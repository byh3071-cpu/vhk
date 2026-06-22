import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

// Goal 82: .vhk 증거 원장 추적 정합.
//   증거 원장(ledger.jsonl·events/ai-actions.jsonl)은 spec 1.1 + Goal 45/55 에서 "레포 영속(✅ 추적)" 설계.
//   회귀: ① 누군가 .gitignore 에 넣거나 ② git rm --cached 로 untrack 하면 증거가 조용히 휘발한다(Goal 45 무결성 훼손).
//   카드 premise("ledger gitignore 추가")는 untracked 를 should-ignore 로 오독한 것 — 실제 정답은 "추적".
//
//   가드는 git 권위 판정을 쓴다(텍스트 휴리스틱 X):
//   - git ls-files: 실제 추적 여부 → ② git rm --cached 회귀 탐지.
//   - git check-ignore --no-index: 추적 여부와 무관하게 .gitignore 패턴 평가(글롭·디렉터리 포함)
//       → ① gitignore 추가 회귀 탐지. (--no-index 없으면 이미 추적된 파일엔 패턴이 안 잡혀 가드가 헛돈다.)
//   이 테스트는 vitest(=CI 집행 경로)에 둔다 — check-goal-82.mjs(수동 게이트)에만 두면 CI 가 회귀를 못 잡는다.

function git(args: string[]): string {
  try {
    return execFileSync('git', args, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch (e) {
    const err = e as { stdout?: Buffer | string }
    return (err.stdout?.toString() ?? '').trim()
  }
}

const inGitRepo = git(['rev-parse', '--is-inside-work-tree']) === 'true'
const gitIt = inGitRepo ? it : it.skip // 비-git 환경(드문 CI 형태)에서는 graceful skip.
const README = existsSync('.vhk/README.md') ? readFileSync('.vhk/README.md', 'utf-8') : ''

const isTracked = (rel: string): boolean => git(['ls-files', '--', rel]) !== ''
const isIgnored = (rel: string): boolean => git(['check-ignore', '--no-index', '--', rel]) !== ''

describe('Goal 82 — .vhk 증거 원장 추적 정책 가드', () => {
  gitIt('증거 원장 2종이 git 추적된다 (레포 영속 — git rm --cached 회귀 탐지)', () => {
    expect(isTracked('.vhk/ledger.jsonl')).toBe(true)
    expect(isTracked('.vhk/events/ai-actions.jsonl')).toBe(true)
  })

  gitIt('증거 원장 2종은 어떤 .gitignore 로도 제외되지 않는다 (--no-index — gitignore 추가 회귀 탐지)', () => {
    expect(isIgnored('.vhk/ledger.jsonl')).toBe(false)
    expect(isIgnored('.vhk/events/ai-actions.jsonl')).toBe(false)
  })

  gitIt('양성 대조: 가드가 실제로 작동함을 증명(거짓 통과 방지)', () => {
    // .vhk/memory.json 은 root .gitignore 로 제외됨(로컬 전용) → isIgnored 가 반드시 잡아야 함.
    expect(isIgnored('.vhk/memory.json')).toBe(true)
    // 존재하지 않는 경로는 추적되지 않음 → isTracked 가 false 를 반환해야 함.
    expect(isTracked('.vhk/__definitely_absent__.xyz')).toBe(false)
  })

  it('.vhk/README 트래킹 정책표가 두 증거 원장을 추적(✅)으로 명문화', () => {
    // 한 행에 두 파일이 함께 ✅ 로 기재됨(spec 1.1).
    expect(README).toMatch(/ai-actions\.jsonl.*ledger\.jsonl|ledger\.jsonl.*ai-actions\.jsonl/)
    expect(README).toMatch(/레포 영속|✅/)
  })
})
