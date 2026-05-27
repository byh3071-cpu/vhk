import { describe, it, expect } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  parseFrontmatter,
  parseGoalFile,
  listGoals,
  updateFrontmatterStatus,
} from '../src/lib/goal-frontmatter.js'

function tmpDir(name: string): string {
  const dir = join(tmpdir(), `vhk-goal-test-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

const SAMPLE = `---
vhk_format: 1
type: goal
id: 0
title: MCP 풀 커버리지
status: DONE
priority: P0
version: v1.1
completed: 2026-05-27
---

# Mission: Build it

Body content here.
`

describe('parseFrontmatter', () => {
  it('YAML frontmatter 와 body 분리', () => {
    const { frontmatter, body } = parseFrontmatter(SAMPLE)
    expect(frontmatter.vhk_format).toBe(1)
    expect(frontmatter.type).toBe('goal')
    expect(frontmatter.id).toBe(0)
    expect(frontmatter.title).toBe('MCP 풀 커버리지')
    expect(frontmatter.status).toBe('DONE')
    expect(frontmatter.priority).toBe('P0')
    expect(frontmatter.version).toBe('v1.1')
    expect(frontmatter.completed).toBe('2026-05-27')
    expect(body.startsWith('# Mission:')).toBe(true)
  })

  it('frontmatter 없는 파일은 빈 객체 + 전체 본문 반환', () => {
    const content = '# 그냥 마크다운\n\n본문'
    const { frontmatter, body } = parseFrontmatter(content)
    expect(Object.keys(frontmatter).length).toBe(0)
    expect(body).toBe(content)
  })

  it('한글 title 안전 파싱', () => {
    const content = `---
vhk_format: 1
type: goal
title: 한국어 제목 with spaces
---
body`
    const { frontmatter } = parseFrontmatter(content)
    expect(frontmatter.title).toBe('한국어 제목 with spaces')
  })
})

describe('updateFrontmatterStatus', () => {
  it('status 만 변경, 다른 필드 보존', () => {
    const updated = updateFrontmatterStatus(SAMPLE, 'IN_PROGRESS')
    expect(updated).toContain('status: IN_PROGRESS')
    expect(updated).not.toContain('status: DONE')
    expect(updated).toContain('id: 0')
    expect(updated).toContain('# Mission: Build it')
  })

  it('extraFields 추가 — completed 날짜', () => {
    const noCompleted = SAMPLE.replace('completed: 2026-05-27\n', '')
    const updated = updateFrontmatterStatus(noCompleted, 'DONE', { completed: '2026-06-01' })
    expect(updated).toContain('status: DONE')
    expect(updated).toContain('completed: 2026-06-01')
  })

  it('frontmatter 없는 파일은 변경 없이 반환', () => {
    const content = '# 그냥 마크다운'
    const updated = updateFrontmatterStatus(content, 'DONE')
    expect(updated).toBe(content)
  })
})

describe('parseGoalFile', () => {
  it('실제 파일 읽어서 ParsedGoal 반환', () => {
    const dir = tmpDir('parse-file')
    const filePath = join(dir, '0-test.md')
    writeFileSync(filePath, SAMPLE, 'utf-8')
    try {
      const parsed = parseGoalFile(filePath)
      expect(parsed).not.toBeNull()
      expect(parsed!.frontmatter.id).toBe(0)
      expect(parsed!.filePath).toBe(filePath)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('존재하지 않는 파일은 null 반환', () => {
    expect(parseGoalFile('/nonexistent/path.md')).toBeNull()
  })
})

describe('listGoals', () => {
  it('goals/ 디렉토리의 *.md 파일을 id 순으로 정렬해서 반환 (_meta 제외)', () => {
    const dir = tmpDir('list-goals')
    writeFileSync(
      join(dir, '0-first.md'),
      `---\nvhk_format: 1\ntype: goal\nid: 0\ntitle: First\nstatus: DONE\npriority: P0\nversion: v1.1\n---\nbody`,
      'utf-8'
    )
    writeFileSync(
      join(dir, '2-third.md'),
      `---\nvhk_format: 1\ntype: goal\nid: 2\ntitle: Third\nstatus: NOT_STARTED\npriority: P1\nversion: v1.3\n---\nbody`,
      'utf-8'
    )
    writeFileSync(
      join(dir, '1-second.md'),
      `---\nvhk_format: 1\ntype: goal\nid: 1\ntitle: Second\nstatus: NOT_STARTED\npriority: P0\nversion: v1.2\n---\nbody`,
      'utf-8'
    )
    writeFileSync(
      join(dir, '_meta.md'),
      `---\nvhk_format: 1\ntype: meta\nproject: test\nversion: v1.1\n---\nmeta body`,
      'utf-8'
    )
    try {
      const goals = listGoals(dir)
      expect(goals.map((g) => g.frontmatter.id)).toEqual([0, 1, 2])
      expect(goals.find((g) => g.frontmatter.type === 'meta')).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('디렉토리 없으면 빈 배열', () => {
    expect(listGoals('/nonexistent/dir')).toEqual([])
  })
})
