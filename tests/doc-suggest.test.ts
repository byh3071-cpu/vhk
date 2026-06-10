import { describe, it, expect } from 'vitest'
import {
  detectTroubleshootingCommits,
  detectDocCandidates,
  formatDocCandidatesForPrompt,
} from '../src/lib/doc-suggest.js'
import type { RecentCommit, SessionDiff } from '../src/lib/git.js'

function commit(message: string, hash = 'abcdef1234'): RecentCommit {
  return { hash, message, date: '2026-06-10', author: '백요한' }
}

const emptyDiff: SessionDiff = { filesChanged: 0, insertions: 0, deletions: 0, files: [] }

describe('detectTroubleshootingCommits', () => {
  it('fix/bug/버그 키워드 커밋만 후보로 — feat/docs 는 제외', () => {
    const commits = [
      commit('fix: 파서 버그 수정', 'aaa1111'),
      commit('feat: 새 명령 추가', 'bbb2222'),
      commit('docs: README 갱신', 'ccc3333'),
      commit('버그 핫픽스: 콜드스타트', 'ddd4444'),
    ]
    const result = detectTroubleshootingCommits(commits)
    expect(result.map(c => c.hash)).toEqual(['aaa1111', 'ddd4444'])
    expect(result[0]).toEqual({ hash: 'aaa1111', message: 'fix: 파서 버그 수정' })
  })

  it('매칭 커밋 없으면 빈 배열', () => {
    expect(detectTroubleshootingCommits([commit('feat: x'), commit('chore: y')])).toEqual([])
  })
})

describe('detectDocCandidates', () => {
  it('package.json 변경 → ADR 후보 + fix 커밋 → 트러블슈팅 후보', () => {
    const diff: SessionDiff = {
      filesChanged: 1,
      insertions: 5,
      deletions: 0,
      files: [{ file: 'package.json', insertions: 5, deletions: 0, status: 'modified' }],
    }
    const result = detectDocCandidates(diff, [commit('fix: 크래시 수정', 'fff5555')])
    expect(result.adr.some(c => c.title === '의존성 변경')).toBe(true)
    expect(result.troubleshooting.map(c => c.hash)).toEqual(['fff5555'])
  })

  it('해당 신호 없으면 양쪽 다 빈 배열', () => {
    const result = detectDocCandidates(emptyDiff, [commit('feat: x')])
    expect(result.adr).toEqual([])
    expect(result.troubleshooting).toEqual([])
  })
})

describe('formatDocCandidatesForPrompt', () => {
  it('후보 0건이면 빈 배열(프롬프트에 섹션 미삽입)', () => {
    expect(formatDocCandidatesForPrompt({ adr: [], troubleshooting: [] })).toEqual([])
  })

  it('ADR 제목·트러블슈팅 커밋이 줄에 포함된다', () => {
    const lines = formatDocCandidatesForPrompt({
      adr: [{ title: '의존성 변경', context: 'package.json 변경', files: ['package.json'] }],
      troubleshooting: [{ hash: 'fff5555aaaa', message: 'fix: 크래시 수정' }],
    })
    const text = lines.join('\n')
    expect(text).toContain('의존성 변경')
    expect(text).toContain('docs/adr')
    expect(text).toContain('docs/troubleshooting')
    expect(text).toContain('fix: 크래시 수정')
    // 자문형(강제 아님) 안내 포함
    expect(text).toContain('해당하면')
  })
})
