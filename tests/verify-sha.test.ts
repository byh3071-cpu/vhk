import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getCommitInfo, type CommitInfo } from '../src/lib/git-repo.js'
import { buildReport, checkEvidenceFreshness } from '../src/commands/verify.js'

// 커밋 1개 있는 임시 git 레포 생성(전역 identity 없는 CI 대비 -c 로 주입).
function makeRepo(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-sha-'))
  const g = (args: string[]): void => {
    execFileSync('git', args, { cwd: d, stdio: 'pipe' })
  }
  g(['init'])
  g(['config', 'user.email', 't@t'])
  g(['config', 'user.name', 't'])
  fs.writeFileSync(path.join(d, 'a.txt'), 'hi\n')
  g(['add', '.'])
  g(['commit', '-m', 'init'])
  return d
}

describe('getCommitInfo (Goal 44 — 기존 git-access 통로)', () => {
  it('커밋 있는 clean 레포 → sha(40)/shortSha(7)/dirty=false', () => {
    const d = makeRepo()
    const info = getCommitInfo(d)
    expect(info).not.toBeNull()
    expect(info!.sha).toMatch(/^[0-9a-f]{40}$/)
    expect(info!.shortSha).toBe(info!.sha.slice(0, 7))
    expect(info!.dirty).toBe(false)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('미커밋 변경 있으면 dirty=true', () => {
    const d = makeRepo()
    fs.writeFileSync(path.join(d, 'b.txt'), 'new\n') // untracked → dirty
    expect(getCommitInfo(d)!.dirty).toBe(true)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('git 레포 아님 → null (추측 금지)', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-nogit-'))
    expect(getCommitInfo(d)).toBeNull()
    fs.rmSync(d, { recursive: true, force: true })
  })

  // ── Goal 85 (#315): 자기참조 봉인 — 자기 산출 추적파일은 dirty 판정에서 제외 ──
  it('자기 ledger(.vhk/ledger.jsonl)만 변경 → dirty=false (clean 취급)', () => {
    const d = makeRepo()
    fs.mkdirSync(path.join(d, '.vhk'), { recursive: true })
    // 추적되는 파일이어야 함(커밋 후 수정) — verify 가 append 하는 상황 모사.
    fs.writeFileSync(path.join(d, '.vhk', 'ledger.jsonl'), '{"v":1}\n')
    execFileSync('git', ['add', '.'], { cwd: d, stdio: 'pipe' })
    execFileSync('git', ['commit', '-m', 'seed ledger'], { cwd: d, stdio: 'pipe' })
    // 이제 ledger 만 append(수정) → working tree 는 ledger 한 줄만 dirty.
    fs.appendFileSync(path.join(d, '.vhk', 'ledger.jsonl'), '{"v":2}\n')
    expect(getCommitInfo(d)!.dirty).toBe(false) // 자기파일만 → clean
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('자기 events(.vhk/events/ai-actions.jsonl) untracked 만 → dirty=false', () => {
    const d = makeRepo()
    fs.mkdirSync(path.join(d, '.vhk', 'events'), { recursive: true })
    fs.writeFileSync(path.join(d, '.vhk', 'events', 'ai-actions.jsonl'), '{"a":1}\n')
    expect(getCommitInfo(d)!.dirty).toBe(false)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('퇴행 0: 자기 ledger + 진짜 소스 변경 → dirty=true (소스 미커밋은 여전히 잡힘)', () => {
    const d = makeRepo()
    fs.mkdirSync(path.join(d, '.vhk'), { recursive: true })
    fs.writeFileSync(path.join(d, '.vhk', 'ledger.jsonl'), '{"v":1}\n') // 자기파일(제외 대상)
    fs.writeFileSync(path.join(d, 'src.ts'), 'export const x = 1\n') // 진짜 소스(untracked)
    expect(getCommitInfo(d)!.dirty).toBe(true)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('과확장 0: 그 외 .vhk 파일(config.json) 변경은 여전히 dirty=true', () => {
    const d = makeRepo()
    fs.mkdirSync(path.join(d, '.vhk'), { recursive: true })
    fs.writeFileSync(path.join(d, '.vhk', 'config.json'), '{}\n') // 자기 ledger 아님 → 제외 안 됨
    expect(getCommitInfo(d)!.dirty).toBe(true)
    fs.rmSync(d, { recursive: true, force: true })
  })
})

describe('buildReport — commit 바인딩', () => {
  it('commit 미지정 → null (v1 호환)', () => {
    expect(buildReport([], 't', 'd').commit).toBeNull()
  })
  it('commit 지정 → 그대로 기록', () => {
    const c: CommitInfo = { sha: 'a'.repeat(40), shortSha: 'aaaaaaa', dirty: false }
    expect(buildReport([], 't', 'd', c).commit).toEqual(c)
  })
})

describe('checkEvidenceFreshness — 낡은 증거 차단', () => {
  const mk = (commit: CommitInfo | null) => buildReport([], 't', 'd', commit)
  const SHA_A: CommitInfo = { sha: 'a'.repeat(40), shortSha: 'aaaaaaa', dirty: false }
  const SHA_B: CommitInfo = { sha: 'b'.repeat(40), shortSha: 'bbbbbbb', dirty: false }

  it('증거 SHA == 현재 HEAD, 둘 다 clean → 신선', () => {
    expect(checkEvidenceFreshness(mk(SHA_A), SHA_A).stale).toBe(false)
  })
  it('증거 SHA ≠ 현재 HEAD → stale (코드 바뀜)', () => {
    const r = checkEvidenceFreshness(mk(SHA_A), SHA_B)
    expect(r.stale).toBe(true)
    expect(r.reasons.join(' ')).toMatch(/≠ 현재 HEAD/)
  })
  it('증거에 commit 없음(v1) → stale', () => {
    expect(checkEvidenceFreshness(mk(null), SHA_A).stale).toBe(true)
  })
  it('현재 커밋 미상(null) → stale', () => {
    expect(checkEvidenceFreshness(mk(SHA_A), null).stale).toBe(true)
  })
  it('현재 working tree dirty → stale', () => {
    expect(checkEvidenceFreshness(mk(SHA_A), { ...SHA_A, dirty: true }).stale).toBe(true)
  })
  it('증거 생성 시점 dirty → stale', () => {
    expect(checkEvidenceFreshness(mk({ ...SHA_A, dirty: true }), SHA_A).stale).toBe(true)
  })
})
