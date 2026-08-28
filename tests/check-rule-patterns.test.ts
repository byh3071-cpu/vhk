import { describe, it, expect } from 'vitest'
import {
  judge,
  frontmatterKeys,
  referencesFromPatternFiles,
  referencesInMarkdown,
  REQUIRED_FIELDS,
} from '../scripts/check-rule-patterns.mjs'

/*
 * #527 — 패턴 사전 규약이 문서로만 있어 2일 만에 붕괴했다.
 * PAT-003 이 결번인 채 RULES.md 가 그 번호를 참조했고, 깨진 링크가 vhk sync 로 파생본 8개에 복제됐다.
 * 참조 무결성이 이 검사에서 가장 값이 큰 이유 — 틀린 참조는 증폭된다.
 */

/** 규약을 만족하는 PAT 문서 본문. */
function validPattern(num: string): string {
  const fields = REQUIRED_FIELDS.map((f: string) => (f === 'id' ? `id: PAT-${num}` : `${f}: 값`))
  return ['---', ...fields, '---', '', `# PAT-${num}`, ''].join('\n')
}

describe('check-rule-patterns (#527)', () => {
  it('규약을 지킨 문서는 통과', () => {
    expect(judge([{ name: 'PAT-001-foo.md', content: validPattern('001') }], [])).toEqual([])
  })

  // 이 검사의 존재 이유 — 틀린 참조는 sync 로 파생본에 복제된다.
  it('실존하지 않는 번호를 참조하면 잡는다', () => {
    const v = judge([{ name: 'PAT-001-foo.md', content: validPattern('001') }], ['PAT-003'])
    expect(v).toHaveLength(1)
    expect(v[0]).toContain('PAT-003')
  })

  it('실존하는 번호 참조는 통과', () => {
    expect(judge([{ name: 'PAT-001-foo.md', content: validPattern('001') }], ['PAT-001'])).toEqual([])
  })

  it('frontmatter 필수 필드 누락을 잡는다', () => {
    const broken = ['---', 'id: PAT-002', '패턴명: x', '---', ''].join('\n')
    const v = judge([{ name: 'PAT-002-bar.md', content: broken }], [])
    expect(v.some((m: string) => m.includes('카테고리'))).toBe(true)
  })

  it('frontmatter 자체가 없으면 잡는다', () => {
    const v = judge([{ name: 'PAT-004-x.md', content: '# 제목만 있는 문서\n' }], [])
    expect(v).toEqual(['PAT-004-x.md — frontmatter 가 없습니다'])
  })

  it('id 가 파일명 번호와 다르면 잡는다', () => {
    const v = judge([{ name: 'PAT-007-x.md', content: validPattern('009') }], [])
    expect(v.some((m: string) => m.includes('파일명 번호'))).toBe(true)
  })

  it('id 키가 있어도 값이 비어 있으면 잡는다', () => {
    const broken = validPattern('007').replace('id: PAT-007', 'id:')
    const v = judge([{ name: 'PAT-007-x.md', content: broken }], [])
    expect(v.some((m: string) => m.includes('frontmatter id'))).toBe(true)
  })

  it('패턴 문서 내부 참조는 자기 선언만 제외하고 깨진 다른 PAT 번호를 수집한다', () => {
    const content = `${validPattern('001')}\n관련: PAT-001, PAT-999\n`
    expect(referencesInMarkdown('docs/patterns/PAT-001-foo.md', content)).toEqual(['PAT-999'])
  })

  it('Git에 아직 추가하지 않은 패턴 문서도 내부의 깨진 참조를 수집한다', () => {
    const files = [
      { name: 'PAT-001-foo.md', content: `${validPattern('001')}\n관련: PAT-999\n` },
    ]
    expect(referencesFromPatternFiles(files)).toEqual(['PAT-999'])
  })

  it('번호 중복을 잡는다', () => {
    const v = judge(
      [
        { name: 'PAT-001-a.md', content: validPattern('001') },
        { name: 'PAT-001-b.md', content: validPattern('001') },
      ],
      [],
    )
    expect(v.some((m: string) => m.includes('번호 중복'))).toBe(true)
  })

  // README 가 기존 슬러그 파일은 개명 금지(append-only)로 두되 신규는 새 형식을 쓰라고 정했다.
  it('baseline 밖의 새 슬러그 파일은 잡는다', () => {
    const legacyShape = ['---', '패턴명: x', '카테고리: git', '출처프로젝트: vhk', '태그: [a]', '발견일: 2026-01-01', '---', ''].join('\n')
    const v = judge([{ name: 'git-new-thing.md', content: legacyShape }], [])
    expect(v.some((m: string) => m.includes('PAT-NNN-영문명.md 형식'))).toBe(true)
  })

  it('baseline 안의 기존 슬러그 파일은 통과', () => {
    const legacyShape = ['---', '패턴명: x', '카테고리: git', '출처프로젝트: vhk', '태그: [a]', '발견일: 2026-01-01', '---', ''].join('\n')
    expect(judge([{ name: 'git-diff-since-no-op.md', content: legacyShape }], [])).toEqual([])
  })

  it('frontmatterKeys — 없으면 null, 있으면 최상위 키', () => {
    expect(frontmatterKeys('# 제목\n')).toBeNull()
    expect(frontmatterKeys('---\na: 1\nb: 2\n---\n')).toEqual(['a', 'b'])
  })
})
