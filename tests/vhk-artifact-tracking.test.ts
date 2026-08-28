import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { VHK_GITIGNORE_TEMPLATE } from '../src/templates/vhk-dir.js'

// Goal 108 공개 경계 예외:
//   생성 프로젝트의 증거 원장(ledger/events) 추적 기본값은 Goal 45/55/82 설계를 유지한다.
//   다만 VHK 공개 저장소 자체의 원장은 관리자 개인 운영 이력이므로 루트 .gitignore 로만 제외한다.
//   즉 제품 템플릿 정책과 공개 저장소 자체 정책을 분리해 어느 쪽도 조용히 뒤집히지 않게 한다.
//
//   가드는 git 권위 판정을 쓴다(텍스트 휴리스틱 X):
//   - git ls-files: 공개 저장소 자체의 실제 추적 여부.
//   - git check-ignore --no-index: 추적 여부와 무관하게 .gitignore 패턴 평가(글롭·디렉터리 포함)
//       → 공개 저장소 ignore 회귀 탐지.
//   - VHK_GITIGNORE_TEMPLATE: 생성 프로젝트에는 공개 저장소 전용 예외가 전파되지 않는지 확인.

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

describe('Goal 108 — 공개 저장소 자체 원장과 생성 프로젝트 정책 분리', () => {
  gitIt('VHK 공개 저장소 자체의 개인 운영 원장 2종은 추적하지 않는다', () => {
    expect(isTracked('.vhk/ledger.jsonl')).toBe(false)
    expect(isTracked('.vhk/events/ai-actions.jsonl')).toBe(false)
  })

  gitIt('VHK 공개 저장소 자체의 개인 운영 원장 2종은 루트 ignore로 재추적을 막는다', () => {
    expect(isIgnored('.vhk/ledger.jsonl')).toBe(true)
    expect(isIgnored('.vhk/events/ai-actions.jsonl')).toBe(true)
  })

  gitIt('정책 상태와 중단된 원자 저장 임시본도 실제 Git 판정에서 무시한다', () => {
    for (const rel of [
      '.vhk/policy.json',
      '.vhk/policy-baseline.json',
      '.vhk/.policy-baseline.json.tmp-123-0',
      '.vhk/run-state.json',
      '.vhk/run-state.lock',
      '.vhk/run-state-recovery.lock',
      '.vhk/.run-state.json.tmp-123-0',
      '.vhk/.cloud.json.tmp-123-0',
    ]) {
      expect(isIgnored(rel)).toBe(true)
    }
  })

  gitIt('양성 대조: 가드가 실제로 작동함을 증명(거짓 통과 방지)', () => {
    // .vhk/memory.json 은 root .gitignore 로 제외됨(로컬 전용) → isIgnored 가 반드시 잡아야 함.
    expect(isIgnored('.vhk/memory.json')).toBe(true)
    // 존재하지 않는 경로는 추적되지 않음 → isTracked 가 false 를 반환해야 함.
    expect(isTracked('.vhk/__definitely_absent__.xyz')).toBe(false)
  })

  it('생성 프로젝트의 .vhk 템플릿은 memory.json 백업본까지 제외한다 (#557)', () => {
    // memory.json 만 막으면 migrate 가 남기는 .v1.bak, 쓰기 전 .bak 이 그대로 추적된다.
    // 원본과 같은 개인 메모라 보호등급도 같아야 한다.
    const lines = VHK_GITIGNORE_TEMPLATE().split('\n').map((l) => l.trim())
    expect(lines).toContain('memory.json')
    expect(lines).toContain('memory.json.*')
    expect(lines).toContain('.cloud.json.tmp-*')
  })

  it('생성 프로젝트의 .vhk 템플릿은 원장 추적 기본값을 유지한다', () => {
    const generatedIgnore = VHK_GITIGNORE_TEMPLATE()
    expect(generatedIgnore).not.toContain('ledger.jsonl\n')
    expect(generatedIgnore).not.toContain('events/*.jsonl')
    expect(README).toMatch(/ai-actions\.jsonl.*ledger\.jsonl|ledger\.jsonl.*ai-actions\.jsonl/)
    expect(README).toMatch(/레포 영속|✅/)
  })
})
