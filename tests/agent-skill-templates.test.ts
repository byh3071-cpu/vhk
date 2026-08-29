import { afterEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  AGENT_SKILL_DISCOVERY_ROOTS,
  AGENT_SKILL_MANIFEST,
  checkAgentSkillSync,
  installAgentSkills,
  projectSkillTemplates,
} from '../src/lib/agent-skill-templates.js'
import { removeDirSync, removeFileSync } from '../src/lib/fs-remove.js'

const dirs: string[] = []

function tmp(prefix = 'vhk-agent-skills-'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

function copyCanonicalSource(targetRoot: string): void {
  const sourceRoot = path.resolve('.agents', 'skills')
  fs.cpSync(sourceRoot, path.join(targetRoot, '.agents', 'skills'), { recursive: true })
  const bundlePath = path.join(targetRoot, 'src', 'lib', 'agent-skill-templates.ts')
  fs.mkdirSync(path.dirname(bundlePath), { recursive: true })
  fs.writeFileSync(bundlePath, '// source fixture\n', 'utf-8')
}

function resignManagedContent(content: string): string {
  const withoutMarker = content.replace(
    /<!-- vhk-agent-skill: [^\r\n]+ -->\r?\n?$/,
    '',
  ).replace(/\r\n/g, '\n')
  const canonical = withoutMarker.endsWith('\n') ? withoutMarker : `${withoutMarker}\n`
  const hash = createHash('sha256').update(canonical, 'utf-8').digest('hex')
  return content.replace(/sha256=[a-f0-9]{64}/, `sha256=${hash}`)
}

afterEach(() => {
  for (const dir of dirs.splice(0)) removeDirSync(dir)
})

describe('Agent Skill 공통 정본과 투영', () => {
  it('네 호스트의 공식 프로젝트 발견 경로를 고정한다', () => {
    expect(AGENT_SKILL_DISCOVERY_ROOTS).toEqual({
      'google-antigravity': '.agents/skills',
      'claude-code': '.claude/skills',
      'openai-codex': '.agents/skills',
      cursor: '.agents/skills',
    })
  })

  it('공통 manifest는 7종이고 Codex 전용 auto-merge는 포함하지 않는다', () => {
    const names = AGENT_SKILL_MANIFEST.skills.map((skill) => skill.name)
    expect(names).toHaveLength(7)
    expect(names).toContain('vhk-auto')
    expect(names).toContain('overnight-vhk-auto')
    expect(names).not.toContain('auto-merge')
    for (const skill of AGENT_SKILL_MANIFEST.skills) {
      expect(skill.platforms).toEqual([
        'google-antigravity',
        'claude-code',
        'openai-codex',
        'cursor',
      ])
    }
  })

  it('생성 번들은 .agents/skills 정본에서 완전히 재현된다', () => {
    const dir = tmp()
    const output = path.join(dir, 'agent-skill-templates.ts')
    const source = fs.readFileSync(path.resolve('src/lib/agent-skill-templates.ts'), 'utf-8')
    fs.writeFileSync(output, source, 'utf-8')

    const result = spawnSync(
      process.execPath,
      [
        path.resolve('scripts/gen-agent-skills.mjs'),
        path.resolve('.agents/skills'),
        output,
        '--check',
      ],
      { cwd: process.cwd(), encoding: 'utf-8' },
    )

    expect(result.status, result.stderr).toBe(0)
    expect(fs.readFileSync(output, 'utf-8')).toBe(source)
  })

  it('공통 manifest의 일부 플랫폼 선언을 거부한다', () => {
    const dir = tmp()
    const skillsRoot = path.join(dir, '.agents', 'skills')
    fs.cpSync(path.resolve('.agents', 'skills'), skillsRoot, { recursive: true })
    const manifestPath = path.join(skillsRoot, 'manifest.json')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
      skills: Array<{ platforms: string[] }>
    }
    manifest.skills[0].platforms = ['claude-code']
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')
    const output = path.join(dir, 'agent-skill-templates.ts')
    fs.writeFileSync(output, fs.readFileSync('src/lib/agent-skill-templates.ts', 'utf-8'), 'utf-8')

    const result = spawnSync(
      process.execPath,
      [path.resolve('scripts/gen-agent-skills.mjs'), skillsRoot, output, '--check'],
      { cwd: process.cwd(), encoding: 'utf-8' },
    )

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('공통 Skill 지원 platform')
  })

  it('SKILL.md의 frontmatter와 description 누락을 거부한다', () => {
    const dir = tmp()
    const skillsRoot = path.join(dir, '.agents', 'skills')
    fs.cpSync(path.resolve('.agents', 'skills'), skillsRoot, { recursive: true })
    const skillPath = path.join(skillsRoot, 'vhk-gate', 'SKILL.md')
    fs.writeFileSync(
      skillPath,
      fs.readFileSync(skillPath, 'utf-8').replace(/^description:[^\r\n]+\r?\n/m, ''),
      'utf-8',
    )
    const output = path.join(dir, 'agent-skill-templates.ts')
    fs.writeFileSync(output, fs.readFileSync('src/lib/agent-skill-templates.ts', 'utf-8'), 'utf-8')

    const missingDescription = spawnSync(
      process.execPath,
      [path.resolve('scripts/gen-agent-skills.mjs'), skillsRoot, output, '--check'],
      { cwd: process.cwd(), encoding: 'utf-8' },
    )
    expect(missingDescription.status).toBe(1)
    expect(missingDescription.stderr).toContain('frontmatter description')

    const original = fs.readFileSync(path.resolve('.agents', 'skills', 'vhk-gate', 'SKILL.md'), 'utf-8')
    fs.writeFileSync(
      skillPath,
      `${original.replace(/^name:[^\r\n]+\r?\n/m, '')}\nname: vhk-gate\n`,
      'utf-8',
    )
    const bodyName = spawnSync(
      process.execPath,
      [path.resolve('scripts/gen-agent-skills.mjs'), skillsRoot, output, '--check'],
      { cwd: process.cwd(), encoding: 'utf-8' },
    )
    expect(bodyName.status).toBe(1)
    expect(bodyName.stderr).toContain('frontmatter name')
  })

  it('핵심 Skill 안전 계약을 생성 번들에서 회귀 검증한다', () => {
    const templates = projectSkillTemplates()
    const gate = templates['vhk-gate']
    const bootstrap = templates['vhk-bootstrap-cursor']
    const goalHealth = templates['vhk-goal-health']

    expect(gate).toMatch(/receipt BLOCK — stale[^\r\n]*vhk verify/)
    expect(gate).not.toMatch(/stale[^\r\n]*mark-start/)
    expect(gate).toMatch(/review exit 1[^\r\n]*DONE[^\r\n]*review `N\/A`/)
    expect(bootstrap).toContain('vhk verify')
    expect(bootstrap).not.toContain('pnpm.cmd')
    expect(goalHealth).toContain('CANCELED')
    expect(goalHealth).toContain('DEFERRED')
    expect(goalHealth).toContain('OBSERVING')
  })

  it('자율 Skill은 비-TTY 로컬 커밋 경로를 명시한다', () => {
    const auto = AGENT_SKILL_MANIFEST.skills.find((skill) => skill.name === 'vhk-auto')
    expect(auto?.files['SKILL.md']).toContain('vhk save --no-push -m')
  })

  it('일반 프로젝트에는 project 배포 5종을 두 공식 경로에 설치한다', () => {
    const dir = tmp()
    const result = installAgentSkills(dir)

    expect(result.created).toHaveLength(10)
    expect(result.conflicts).toEqual([])
    expect(fs.existsSync(path.join(dir, '.agents', 'skills', 'vhk-gate', 'SKILL.md'))).toBe(true)
    expect(fs.existsSync(path.join(dir, '.claude', 'skills', 'vhk-gate', 'SKILL.md'))).toBe(true)
    expect(fs.existsSync(path.join(dir, '.agents', 'skills', 'vhk-auto', 'SKILL.md'))).toBe(false)
    expect(fs.existsSync(path.join(dir, '.cursor', 'skills'))).toBe(false)

    const second = installAgentSkills(dir)
    expect(second.created).toEqual([])
    expect(second.updated).toEqual([])
    expect(second.unchanged).toHaveLength(10)
  })

  it('표식이 남아 있어도 본문을 손수정한 파일은 보존하고 충돌로 보고한다', () => {
    const dir = tmp()
    installAgentSkills(dir)
    const target = path.join(dir, '.claude', 'skills', 'vhk-gate', 'SKILL.md')
    const modified = fs.readFileSync(target, 'utf-8').replace('# VHK Gate', '# 사용자 Gate')
    fs.writeFileSync(target, modified, 'utf-8')

    const result = installAgentSkills(dir)

    expect(result.conflicts).toContain('.claude/skills/vhk-gate/SKILL.md')
    expect(fs.readFileSync(target, 'utf-8')).toBe(modified)
  })

  it('본문 해시가 맞는 구버전 관리 표식만 안전하게 갱신한다', () => {
    const dir = tmp()
    installAgentSkills(dir)
    const target = path.join(dir, '.agents', 'skills', 'vhk-gate', 'SKILL.md')
    const currentVersion = AGENT_SKILL_MANIFEST.bundleVersion
    const old = fs.readFileSync(target, 'utf-8').replace(
      `vhk-gate@${currentVersion}`,
      `vhk-gate@${currentVersion - 1}`,
    )
    fs.writeFileSync(target, old, 'utf-8')

    const result = installAgentSkills(dir)

    expect(result.updated).toContain('.agents/skills/vhk-gate/SKILL.md')
    expect(fs.readFileSync(target, 'utf-8')).toContain(`vhk-gate@${currentVersion}`)
  })

  it('현재 번들보다 새 버전의 관리본은 다운그레이드하지 않는다', () => {
    const dir = tmp()
    installAgentSkills(dir)
    const target = path.join(dir, '.agents', 'skills', 'vhk-gate', 'SKILL.md')
    const currentVersion = AGENT_SKILL_MANIFEST.bundleVersion
    const future = fs.readFileSync(target, 'utf-8').replace(
      `vhk-gate@${currentVersion}`,
      `vhk-gate@${currentVersion + 1}`,
    )
    fs.writeFileSync(target, future, 'utf-8')

    const result = installAgentSkills(dir)

    expect(result.conflicts).toContain('.agents/skills/vhk-gate/SKILL.md')
    expect(fs.readFileSync(target, 'utf-8')).toBe(future)
  })

  it('미상 구버전 본문은 자체 해시가 맞아도 알려진 관리본으로 간주하지 않는다', () => {
    const dir = tmp()
    installAgentSkills(dir)
    const target = path.join(dir, '.agents', 'skills', 'vhk-gate', 'SKILL.md')
    const currentVersion = AGENT_SKILL_MANIFEST.bundleVersion
    const customized = resignManagedContent(
      fs.readFileSync(target, 'utf-8')
        .replace('# VHK Gate', '# 사용자 Gate')
        .replace(`vhk-gate@${currentVersion}`, `vhk-gate@${currentVersion - 1}`),
    )
    fs.writeFileSync(target, customized, 'utf-8')

    const result = installAgentSkills(dir)

    expect(result.conflicts).toContain('.agents/skills/vhk-gate/SKILL.md')
    expect(fs.readFileSync(target, 'utf-8')).toBe(customized)
  })

  it('기존 .cursor/skills 사용자본은 변경하지 않고 수동 병합 충돌로 보고한다', () => {
    const dir = tmp()
    const target = path.join(dir, '.cursor', 'skills', 'vhk-gate', 'SKILL.md')
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, '# 사용자 Cursor Skill\n', 'utf-8')

    const result = installAgentSkills(dir)

    expect(result.conflicts).toContain('.cursor/skills/vhk-gate')
    expect(fs.readFileSync(target, 'utf-8')).toBe('# 사용자 Cursor Skill\n')
  })

  it('일반 프로젝트의 우연히 같은 src 경로를 VHK 원본 저장소로 오인하지 않는다', () => {
    const dir = tmp()
    const collision = path.join(dir, 'src', 'lib', 'agent-skill-templates.ts')
    fs.mkdirSync(path.dirname(collision), { recursive: true })
    fs.writeFileSync(collision, '// unrelated project file\n', 'utf-8')

    const result = installAgentSkills(dir)

    expect(result.created).toHaveLength(10)
    expect(result.conflicts).toEqual([])
    expect(fs.existsSync(path.join(dir, '.agents', 'skills', 'vhk-auto', 'SKILL.md'))).toBe(false)
  })

  it('Skill 경로의 심볼릭 링크를 따라 프로젝트 밖에 쓰지 않는다', () => {
    const dir = tmp()
    const outside = tmp('vhk-agent-outside-')
    const link = path.join(dir, '.agents', 'skills', 'vhk-gate')
    fs.mkdirSync(path.dirname(link), { recursive: true })
    try {
      fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir')
    } catch {
      return
    }

    const result = installAgentSkills(dir)

    expect(result.conflicts).toContain('.agents/skills/vhk-gate/SKILL.md')
    expect(fs.existsSync(path.join(outside, 'SKILL.md'))).toBe(false)
  })

  it('sync 검사는 충돌을 탐지하되 파일을 쓰지 않는다', () => {
    const dir = tmp()
    installAgentSkills(dir)
    const target = path.join(dir, '.agents', 'skills', 'vhk-gate', 'SKILL.md')
    const modified = fs.readFileSync(target, 'utf-8').replace('# VHK Gate', '# 사용자 Gate')
    fs.writeFileSync(target, modified, 'utf-8')
    const before = fs.statSync(target).mtimeMs

    const result = checkAgentSkillSync(dir)

    expect(result.ok).toBe(false)
    expect(result.conflicts).toContain('.agents/skills/vhk-gate/SKILL.md')
    expect(fs.readFileSync(target, 'utf-8')).toBe(modified)
    expect(fs.statSync(target).mtimeMs).toBe(before)
  })

  it('VHK 원본 저장소에서는 repository 배포 Skill까지 Claude 투영하고 정본 drift를 잡는다', () => {
    const dir = tmp('vhk-agent-source-')
    copyCanonicalSource(dir)

    const installed = installAgentSkills(dir)
    expect(installed.created).toContain('.claude/skills/vhk-auto/SKILL.md')
    expect(checkAgentSkillSync(dir).ok).toBe(true)

    const canonical = path.join(dir, '.agents', 'skills', 'vhk-auto', 'SKILL.md')
    fs.appendFileSync(canonical, '\n사용자 변경\n', 'utf-8')
    const drift = checkAgentSkillSync(dir)
    expect(drift.ok).toBe(false)
    expect(drift.conflicts).toContain('.agents/skills/vhk-auto/SKILL.md')
    expect(drift.bundleDrift).toContain('src/lib/agent-skill-templates.ts')
  })

  it('사용자 수정된 Skill에서는 빠진 보조 파일도 자동 생성하지 않는다', () => {
    const dir = tmp('vhk-agent-source-conflict-')
    copyCanonicalSource(dir)
    installAgentSkills(dir)
    const skill = path.join(dir, '.claude', 'skills', 'vhk-auto', 'SKILL.md')
    const reference = path.join(dir, '.claude', 'skills', 'vhk-auto', 'references', 'review-adapters.md')
    fs.writeFileSync(skill, fs.readFileSync(skill, 'utf-8').replace('# VHK Autopilot', '# 사용자 Autopilot'), 'utf-8')
    removeFileSync(reference)

    const result = installAgentSkills(dir)

    expect(result.conflicts).toContain('.claude/skills/vhk-auto/SKILL.md')
    expect(fs.existsSync(reference)).toBe(false)
  })
})
