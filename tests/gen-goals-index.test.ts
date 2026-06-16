import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// tsc 는 tests/ 미검사 → .mjs 직접 import 안전(meta-gate.test.ts 선례).
import { parseFlatFrontmatter, buildGoalsIndex, collectGoals } from '../scripts/gen-goals-index.mjs'

const SCRIPT = path.join(process.cwd(), 'scripts', 'gen-goals-index.mjs')

function goalMd(id: number, title: string, status = 'DONE', extra = ''): string {
  return `---\nvhk_format: 1\ntype: goal\nid: ${id}\ntitle: ${title}\nstatus: ${status}\npriority: P1\n${extra}---\n\n# Goal ${id}\n`
}

describe('parseFlatFrontmatter', () => {
  it('flat key:value 파싱 + BOM 허용', () => {
    const fm = parseFlatFrontmatter('﻿---\ntype: goal\nid: 7\ntitle: 한국어 제목 — P1\n---\nbody')
    expect(fm).toEqual({ type: 'goal', id: '7', title: '한국어 제목 — P1' })
  })

  it('frontmatter 없으면 null', () => {
    expect(parseFlatFrontmatter('# 그냥 문서')).toBeNull()
  })

  it('따옴표 값은 제품 파서처럼 벗긴다 (적대검증 D2-2/D2-3 — 게이트·제품 해석 분기 방지)', () => {
    const fm = parseFlatFrontmatter('---\ntype: goal\nid: "9"\nstatus: \'DONE\'\n---\nx')
    expect(fm).toEqual({ type: 'goal', id: '9', status: 'DONE' })
  })
})

describe('collectGoals + buildGoalsIndex', () => {
  it('id 오름차순 표 + 상태 집계 + 수동편집 금지 마커', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-goalsidx-'))
    fs.writeFileSync(path.join(d, '2-bar.md'), goalMd(2, '두 번째 목표', 'IN_PROGRESS'))
    fs.writeFileSync(path.join(d, '1-foo.md'), goalMd(1, '첫 목표', 'DONE', 'leads_to: 다음 단계\n'))
    fs.writeFileSync(path.join(d, '_meta.md'), '---\ntype: meta\n---\n게이트')
    fs.writeFileSync(path.join(d, 'notes.md'), '# frontmatter 없음')

    const goals = collectGoals(d)
    expect(goals.map((g: { id: number }) => g.id)).toEqual([1, 2])

    const md = buildGoalsIndex(goals)
    expect(md).toContain('수동 편집 금지')
    expect(md).toContain('| 1 | 첫 목표 |')
    expect(md).toContain('다음 단계')
    expect(md).toContain('| 2 | 두 번째 목표 |')
    expect(md).toContain('DONE 1')
    expect(md).toContain('IN_PROGRESS 1')
    // _meta·frontmatter 없는 파일은 표(행) 제외 — 헤더의 _meta.md 안내 링크는 허용
    const rows = md.split('\n').filter((l) => /^\| \d+ \|/.test(l))
    expect(rows).toHaveLength(2)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('title 의 파이프·백슬래시는 이스케이프 (표 깨짐 방지, CodeQL incomplete-sanitization)', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-goalsidx-'))
    fs.writeFileSync(path.join(d, '3-pipe.md'), goalMd(3, 'a | b'))
    fs.writeFileSync(path.join(d, '4-bs.md'), goalMd(4, 'c \\ d'))
    const md = buildGoalsIndex(collectGoals(d))
    expect(md).toContain('a \\| b')
    expect(md).toContain('c \\\\ d')
    fs.rmSync(d, { recursive: true, force: true })
  })
})

describe('gen-goals-index e2e', () => {
  it('실행하면 README.md 생성', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-goalsidx-e2e-'))
    fs.writeFileSync(path.join(d, '1-foo.md'), goalMd(1, '첫 목표'))
    const out = path.join(d, 'README.md')
    execFileSync('node', [SCRIPT, d, out], { encoding: 'utf-8', stdio: 'pipe' })
    const md = fs.readFileSync(out, 'utf-8')
    expect(md).toContain('| 1 | 첫 목표 |')
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('레포 실물 goals/ 에 대해 61+ goal 행 생성 (한국어 제목 포함)', () => {
    const tmpOut = path.join(os.tmpdir(), `vhk-goalsidx-${process.pid}.md`)
    execFileSync('node', [SCRIPT, 'goals', tmpOut], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      stdio: 'pipe',
    })
    const md = fs.readFileSync(tmpOut, 'utf-8')
    const rows = md.split('\n').filter((l) => /^\| \d+ \|/.test(l))
    expect(rows.length).toBeGreaterThanOrEqual(60)
    fs.rmSync(tmpOut, { force: true })
  })

  // stale 봉쇄(#6): 커밋된 goals/README.md 가 재생성 결과와 동일해야 한다.
  // 깨지면 `node scripts/gen-goals-index.mjs` 재실행 후 커밋.
  it('커밋된 goals/README.md == 재생성 결과 (드리프트 0)', () => {
    const committed = fs.readFileSync(path.join(process.cwd(), 'goals', 'README.md'), 'utf-8')
    const fresh = buildGoalsIndex(collectGoals('goals'))
    expect(committed.trim()).toBe(fresh.trim())
  })
})
