import { describe, it, expect } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  parseFrontmatter,
  parseGoalFile,
  listGoals,
  updateFrontmatterStatus,
  findDuplicateIds,
  normalizeLegacyStatus,
  planGoalFileMigrate,
  type ParsedGoal,
} from '../src/lib/goal-frontmatter.js'

// 테스트용 최소 ParsedGoal 생성 (id 만 의미 있음).
function goalWithId(id: number): ParsedGoal {
  return { filePath: `${id}.md`, frontmatter: { id }, body: '' }
}

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

  it('UTF-8 BOM 이 있어도 frontmatter 를 파싱한다 (Windows PowerShell 호환)', () => {
    const { frontmatter, body } = parseFrontmatter('\ufeff' + SAMPLE)
    expect(frontmatter.type).toBe('goal')
    expect(frontmatter.id).toBe(0)
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

  // 특성화 테스트 — 기존 동작 가드 (즉시 통과). title 값에 콜론이 있어도
  // 첫 콜론만 키 구분에 쓰이고 나머지는 값으로 보존됨을 못박는다.
  it('title 값의 콜론 보존 (첫 콜론만 키 구분)', () => {
    const content = `---
type: goal
title: 도구: 맥락 동기화
---
body`
    const { frontmatter } = parseFrontmatter(content)
    expect(frontmatter.title).toBe('도구: 맥락 동기화')
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

  it('BOM 있는 파일도 status 갱신 (parse 측과 비대칭으로 무변경 거짓 성공되던 회귀 가드 — 리뷰 A3-02)', () => {
    const withBom = '\uFEFF' + SAMPLE
    const updated = updateFrontmatterStatus(withBom, 'IN_PROGRESS')
    expect(updated).toContain('status: IN_PROGRESS')
    expect(updated).not.toBe(withBom)
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

describe('findDuplicateIds', () => {
  it('id 가 겹치는 goal 들의 중복 id 를 오름차순 반환', () => {
    const goals = [goalWithId(2), goalWithId(1), goalWithId(1), goalWithId(2)]
    expect(findDuplicateIds(goals)).toEqual([1, 2])
  })

  it('중복 없으면 빈 배열', () => {
    expect(findDuplicateIds([goalWithId(0), goalWithId(1), goalWithId(2)])).toEqual([])
  })

  it('각 중복 id 는 한 번만 보고 (3개 겹쳐도 단일 항목)', () => {
    const goals = [goalWithId(1), goalWithId(1), goalWithId(1)]
    expect(findDuplicateIds(goals)).toEqual([1])
  })

  it('빈 입력은 빈 배열', () => {
    expect(findDuplicateIds([])).toEqual([])
  })
})

describe('normalizeLegacyStatus', () => {
  it('maps legacy active to IN_PROGRESS', () => {
    expect(normalizeLegacyStatus('active')).toBe('IN_PROGRESS')
  })

  it('passes through standard enum', () => {
    expect(normalizeLegacyStatus('DONE')).toBe('DONE')
  })

  it('returns null for unknown', () => {
    expect(normalizeLegacyStatus('weird')).toBeNull()
  })
})

describe('planGoalFileMigrate', () => {
  it('adds type goal and normalizes legacy status', () => {
    const content = `---
id: 99
status: active
title: test
---

body`
    const plan = planGoalFileMigrate('goals/99-test.md', content)
    expect(plan).not.toBeNull()
    expect(plan!.actions.some((a) => a.includes('type: goal'))).toBe(true)
    expect(plan!.actions.some((a) => a.includes('IN_PROGRESS'))).toBe(true)
    expect(plan!.nextContent).toContain('type: goal')
    expect(plan!.nextContent).toContain('status: IN_PROGRESS')
  })
})
