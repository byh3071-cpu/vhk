import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  CURSOR_SKILL_TEMPLATES,
  installCursorSkills,
} from '../src/lib/cursor-skill-templates.js'
import { AGENT_SKILL_MANIFEST } from '../src/lib/agent-skill-templates.js'

const dirs: string[] = []

function tmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-cursor-compat-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('cursor-skill-templates 호환 표면', () => {
  it('기존 5종 export는 공통 Agent Skill 번들을 가리킨다', () => {
    expect(Object.keys(CURSOR_SKILL_TEMPLATES).sort()).toEqual([
      'vhk-bootstrap-cursor',
      'vhk-dogfood-issue',
      'vhk-evolve-loop',
      'vhk-gate',
      'vhk-goal-health',
    ])
    expect(CURSOR_SKILL_TEMPLATES['vhk-gate']).toContain(
      `vhk-agent-skill: vhk-gate@${AGENT_SKILL_MANIFEST.bundleVersion}`,
    )
  })

  it('호환 설치 함수도 .cursor가 아니라 공통 발견 경로를 쓴다', () => {
    const dir = tmp()
    const result = installCursorSkills(dir)

    expect(result.created.sort()).toEqual(Object.keys(CURSOR_SKILL_TEMPLATES).sort())
    expect(fs.existsSync(path.join(dir, '.agents', 'skills', 'vhk-gate', 'SKILL.md'))).toBe(true)
    expect(fs.existsSync(path.join(dir, '.claude', 'skills', 'vhk-gate', 'SKILL.md'))).toBe(true)
    expect(fs.existsSync(path.join(dir, '.cursor', 'skills'))).toBe(false)
  })
})
