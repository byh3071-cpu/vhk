import { afterEach, describe, expect, it, vi } from 'vitest'
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
import { MAX_LINE_CHARS } from '../src/lib/scan-secrets.js'

const dirs: string[] = []

function tmp(prefix = 'vhk-agent-skills-'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

function copyCanonicalSource(targetRoot: string): void {
  const sourceRoot = path.resolve('.agents', 'skills')
  fs.cpSync(sourceRoot, path.join(targetRoot, '.agents', 'skills'), { recursive: true })
  fs.writeFileSync(
    path.join(targetRoot, 'package.json'),
    `${JSON.stringify({ name: '@byh3071/vhk' }, null, 2)}\n`,
    'utf-8',
  )
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

function legacyV2SkillBody(name: 'vhk-auto' | 'overnight-vhk-auto'): string {
  let body = fs.readFileSync(path.resolve('.agents', 'skills', name, 'SKILL.md'), 'utf-8')
    .replace(/\r\n/g, '\n')
  if (name === 'vhk-auto') {
    body = body
      .replace(
        /- \*\*INV-11\*\*[\s\S]*?이 검사를 생략할 수 없다\.\n/,
        '',
      )
      .replace(
        /0\. \*\*안전 확인\*\*:[\s\S]*?\(INV-6·INV-11\)\n/,
        '0. **안전 확인**: `.vhk/HARD_STOP` 존재? → 있으면 즉시 중단, 사유 보고하고 종료. (INV-6)\n',
      )
      .replace(
        /4\. \*\*결정론 게이트\*\*: `git branch --show-current`[\s\S]*?`\.vhk\/reports\/latest\.json` 을 읽는다\.\n/,
        '4. **결정론 게이트**: `vhk verify` 실행 → `.vhk/reports/latest.json` 을 읽는다.\n',
      )
      .replace(
        /     2\) `git branch --show-current`[\s\S]*?\(INV-11\)\n/,
        '',
      )
      .replace('     3) `vhk save --no-push', '     2) `vhk save --no-push')
      .replace('     4) `vhk receipt`', '     3) `vhk receipt`')
      .replace('     5) `vhk autonomy-log', '     4) `vhk autonomy-log')
      .replace('     6) goal 완주', '     5) goal 완주')
  } else {
    body = body
      .replace('INV-1..INV-11', 'INV-1..INV-10')
      .replace(
        /0\. If `\.vhk\/HARD_STOP` exists → report and exit\.[\s\S]*?otherwise report and stop\.\n/,
        '0. If `.vhk/HARD_STOP` exists → report and exit.\n',
      )
  }
  return body.endsWith('\n') ? body : `${body}\n`
}

function legacyV3AutoBody(): string {
  let body = fs.readFileSync(path.resolve('.agents', 'skills', 'vhk-auto', 'SKILL.md'), 'utf-8')
    .replace(/\r\n/g, '\n')
  body = body
    .replace(
      /- \*\*INV-11\*\*[\s\S]*?이 검사를 생략할 수 없다\.\n/,
      '- **INV-11** 자동 commit은 깨끗한 작업 브랜치에서만 한다. 시작 전에 `git status --short`가\n'
        + '  비어 있어야 하고 `git branch --show-current`가 비어 있거나 `main`·`master`이면 시작하지 않는다.\n'
        + '  기존 변경을 stage·stash·reset·삭제해 기준선을 만들지 않는다. commit 직전 다시 상태를 읽어\n'
        + '  현재 Goal 범위 밖 경로가 하나라도 있으면 `vhk save`를 호출하지 않고 blocked로 끝낸다.\n'
        + '  `vhk save`는 저장소의 모든 변경을 stage하므로 이 검사를 생략할 수 없다.\n',
    )
    .replace(
      /0\. \*\*안전 확인\*\*:[\s\S]*?\(INV-6·INV-11\)\n/,
      '0. **안전 확인**: `.vhk/HARD_STOP` 존재? → 있으면 즉시 중단, 사유 보고하고 종료. 이어서\n'
        + '   `git status --short`가 빈 값이고 `git branch --show-current`가 비어 있지 않은 작업 브랜치인지\n'
        + '   확인한다. dirty·detached HEAD·`main`·`master`면 어떤 파일도 바꾸기 전에 사유를 보고하고 종료한다.\n'
        + '   (INV-6·INV-11)\n',
    )
    .replace(
      /4\. \*\*결정론 게이트\*\*: `git branch --show-current`[\s\S]*?`\.vhk\/reports\/latest\.json` 을 읽는다\.\n/,
      '4. **결정론 게이트**: `vhk verify` 실행 → `.vhk/reports/latest.json` 을 읽는다.\n',
    )
    .replace(
      /     2\) `git branch --show-current`[\s\S]*?\(INV-11\)\n/,
      '     2) `git status --short`의 모든 추적·미추적 경로가 이번 Goal의 선언 범위인지 다시 대조한다.\n'
        + '        Goal 범위 밖 경로나 출처를 확인할 수 없는 동시 변경이 있으면 기존 변경을 건드리지 말고\n'
        + '        blocked 분기로 닫는다. 모두 범위 안일 때만 다음 단계로 간다. (INV-11)\n',
    )
  return body.endsWith('\n') ? body : `${body}\n`
}

function legacyV3OvernightBody(): string {
  let body = fs.readFileSync(
    path.resolve('.agents', 'skills', 'overnight-vhk-auto', 'SKILL.md'),
    'utf-8',
  ).replace(/\r\n/g, '\n')
  body = body.replace(
    /0\. If `\.vhk\/HARD_STOP` exists → report and exit\.[\s\S]*?otherwise report and stop\.\n/,
    '0. If `.vhk/HARD_STOP` exists → report and exit. Before any mutation, apply vhk-auto INV-11: require\n'
      + '   an empty `git status --short` and a named branch other than `main` or `master`; otherwise report and stop.\n',
  )
  return body.endsWith('\n') ? body : `${body}\n`
}

afterEach(() => {
  vi.restoreAllMocks()
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
    const skillsRoot = path.join(dir, '.agents', 'skills')
    fs.cpSync(path.resolve('.agents', 'skills'), skillsRoot, { recursive: true })
    const output = path.join(dir, 'agent-skill-templates.ts')
    const source = fs.readFileSync(path.resolve('src/lib/agent-skill-templates.ts'), 'utf-8')
    fs.writeFileSync(output, source, 'utf-8')

    const result = spawnSync(
      process.execPath,
      [
        path.resolve('scripts/gen-agent-skills.mjs'),
        skillsRoot,
        output,
        '--check',
      ],
      { cwd: process.cwd(), encoding: 'utf-8' },
    )

    expect(result.status, result.stderr).toBe(0)
    expect(fs.readFileSync(output, 'utf-8')).toBe(source)
    expect(Math.max(...source.split(/\r?\n/).map((line) => line.length))).toBeLessThanOrEqual(
      MAX_LINE_CHARS,
    )
  })

  it('정본 본문 변경은 bundleVersion 증가 없이는 재생성하지 않는다', () => {
    const dir = tmp('vhk-agent-generator-version-')
    const skillsRoot = path.join(dir, '.agents', 'skills')
    fs.cpSync(path.resolve('.agents', 'skills'), skillsRoot, { recursive: true })
    const output = path.join(dir, 'src', 'lib', 'agent-skill-templates.ts')
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.writeFileSync(output, fs.readFileSync('src/lib/agent-skill-templates.ts', 'utf-8'), 'utf-8')
    fs.appendFileSync(path.join(skillsRoot, 'vhk-gate', 'SKILL.md'), '\n정본 변경\n', 'utf-8')

    const rejected = spawnSync(
      process.execPath,
      [path.resolve('scripts/gen-agent-skills.mjs'), skillsRoot, output],
      { cwd: process.cwd(), encoding: 'utf-8' },
    )

    expect(rejected.status).toBe(1)
    expect(rejected.stderr).toContain('bundleVersion')

    const manifestPath = path.join(skillsRoot, 'manifest.json')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
      bundleVersion: number
    }
    manifest.bundleVersion += 1
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')
    const accepted = spawnSync(
      process.execPath,
      [path.resolve('scripts/gen-agent-skills.mjs'), skillsRoot, output],
      { cwd: process.cwd(), encoding: 'utf-8' },
    )

    expect(accepted.status).toBe(0)
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

  it('플랫폼에서 겹치거나 예약된 Skill 파일 이름을 거부한다', () => {
    const dir = tmp('vhk-agent-generator-portable-')
    const skillsRoot = path.join(dir, '.agents', 'skills')
    fs.cpSync(path.resolve('.agents', 'skills'), skillsRoot, { recursive: true })
    const manifestPath = path.join(skillsRoot, 'manifest.json')
    const output = path.join(dir, 'agent-skill-templates.ts')
    fs.writeFileSync(output, fs.readFileSync('src/lib/agent-skill-templates.ts', 'utf-8'), 'utf-8')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
      skills: Array<{ files: string[] }>
    }
    const references = path.join(skillsRoot, 'vhk-auto', 'references')
    fs.writeFileSync(path.join(references, 'A.md'), '# portable fixture\n', 'utf-8')
    manifest.skills[0].files.push('references/A.md', 'references/a.md')
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')

    const collision = spawnSync(
      process.execPath,
      [path.resolve('scripts/gen-agent-skills.mjs'), skillsRoot, output, '--check'],
      { cwd: process.cwd(), encoding: 'utf-8' },
    )
    expect(collision.status).toBe(1)
    expect(collision.stderr).toContain('플랫폼 간 충돌')

    manifest.skills[0].files = ['SKILL.md', 'CON.md']
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')
    const reserved = spawnSync(
      process.execPath,
      [path.resolve('scripts/gen-agent-skills.mjs'), skillsRoot, output, '--check'],
      { cwd: process.cwd(), encoding: 'utf-8' },
    )
    expect(reserved.status).toBe(1)
    expect(reserved.stderr).toContain('Windows 예약어')

    manifest.skills[0].name = 'con'
    manifest.skills[0].files = ['SKILL.md']
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')
    const reservedSkill = spawnSync(
      process.execPath,
      [path.resolve('scripts/gen-agent-skills.mjs'), skillsRoot, output, '--check'],
      { cwd: process.cwd(), encoding: 'utf-8' },
    )
    expect(reservedSkill.status).toBe(1)
    expect(reservedSkill.stderr).toContain('Windows 예약어 skill 이름')
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

  it('정본 Skill 경로의 junction·symlink를 따라 외부 내용을 번들에 넣지 않는다', () => {
    const dir = tmp('vhk-agent-generator-link-')
    const outside = tmp('vhk-agent-generator-outside-')
    const skillsRoot = path.join(dir, '.agents', 'skills')
    fs.cpSync(path.resolve('.agents', 'skills'), skillsRoot, { recursive: true })
    const linkedSkill = path.join(skillsRoot, 'vhk-gate')
    removeDirSync(linkedSkill)
    fs.mkdirSync(outside, { recursive: true })
    fs.writeFileSync(
      path.join(outside, 'SKILL.md'),
      '---\nname: vhk-gate\ndescription: outside\n---\n\n# Outside\n',
      'utf-8',
    )
    try {
      fs.symlinkSync(outside, linkedSkill, process.platform === 'win32' ? 'junction' : 'dir')
    } catch {
      return
    }
    const output = path.join(dir, 'src', 'lib', 'agent-skill-templates.ts')
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.writeFileSync(output, fs.readFileSync('src/lib/agent-skill-templates.ts', 'utf-8'), 'utf-8')

    const result = spawnSync(
      process.execPath,
      [path.resolve('scripts/gen-agent-skills.mjs'), skillsRoot, output, '--check'],
      { cwd: process.cwd(), encoding: 'utf-8' },
    )

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/symlink|junction|링크/i)
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

  it('자율 Skill은 깨끗한 시작점과 비-TTY 로컬 커밋 경로를 강제한다', () => {
    const auto = AGENT_SKILL_MANIFEST.skills.find((skill) => skill.name === 'vhk-auto')
    const body = auto?.files['SKILL.md'] ?? ''
    expect(body).toContain('status --porcelain=v1 -z --untracked-files=all')
    expect(body).toContain('rename/copy의 원본·대상')
    expect(body).toContain('Goal 범위 밖')
    expect(body).toContain('vhk save --no-push -m')
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

  it('실제 v1 본문 해시를 가진 goal-health 관리본을 현재 번들로 갱신한다', () => {
    const dir = tmp()
    installAgentSkills(dir)
    const target = path.join(dir, '.agents', 'skills', 'vhk-goal-health', 'SKILL.md')
    let legacy = fs.readFileSync(
      path.resolve('tests', 'fixtures', 'agent-skills', 'v1', 'vhk-goal-health', 'SKILL.md'),
      'utf-8',
    ).replace(/\r\n/g, '\n')
    if (!legacy.endsWith('\n')) legacy += '\n'
    const hash = createHash('sha256').update(legacy, 'utf-8').digest('hex')
    fs.writeFileSync(
      target,
      `${legacy}<!-- vhk-agent-skill: vhk-goal-health@1 source=.agents/skills sha256=${hash} -->\n`,
      'utf-8',
    )

    const result = installAgentSkills(dir)
    const updated = fs.readFileSync(target, 'utf-8')

    expect(hash).toBe('328c2c376fbb993bbf238a71087f9c864cf07163176bf262433a5e36f7c78a56')
    expect(result.updated).toContain('.agents/skills/vhk-goal-health/SKILL.md')
    expect(updated).toContain('CANCELED')
    expect(updated).toContain(`vhk-goal-health@${AGENT_SKILL_MANIFEST.bundleVersion}`)
  })

  it('실제 v2 auto·overnight 본문을 현재 관리 투영으로 갱신한다', () => {
    const dir = tmp('vhk-agent-source-v2-')
    copyCanonicalSource(dir)
    installAgentSkills(dir)
    const fixtures = [
      {
        name: 'vhk-auto' as const,
        hash: '370579087d2505742753e07043b9c1d866d881c2adcfda80a1b72a59e6cda8b7',
      },
      {
        name: 'overnight-vhk-auto' as const,
        hash: '7decf6ef274439677028b5684c90064a2e872cef82d457a722026ce20dcd7fde',
      },
    ]
    for (const fixture of fixtures) {
      const legacy = legacyV2SkillBody(fixture.name)
      const hash = createHash('sha256').update(legacy, 'utf-8').digest('hex')
      expect(hash).toBe(fixture.hash)
      const target = path.join(dir, '.claude', 'skills', fixture.name, 'SKILL.md')
      fs.writeFileSync(
        target,
        `${legacy}<!-- vhk-agent-skill: ${fixture.name}@2 source=.agents/skills sha256=${hash} -->\n`,
        'utf-8',
      )
    }

    const result = installAgentSkills(dir)

    for (const fixture of fixtures) {
      const relativePath = `.claude/skills/${fixture.name}/SKILL.md`
      expect(result.updated).toContain(relativePath)
      expect(fs.readFileSync(path.join(dir, ...relativePath.split('/')), 'utf-8'))
        .toContain(`${fixture.name}@${AGENT_SKILL_MANIFEST.bundleVersion}`)
    }
    expect(result.backups).toHaveLength(2)
    for (const backup of result.backups) {
      expect(fs.existsSync(path.join(dir, ...backup.split('/')))).toBe(true)
    }
  })

  it('실제 v3 auto 본문을 현재 관리 투영으로 갱신한다', () => {
    const dir = tmp('vhk-agent-source-v3-')
    copyCanonicalSource(dir)
    installAgentSkills(dir)
    const legacy = legacyV3AutoBody()
    const hash = createHash('sha256').update(legacy, 'utf-8').digest('hex')
    expect(hash).toBe('ed38c38511b0981d3c54a5be7e8de98467861224df0276034b99d4e1aaa21ff1')
    const target = path.join(dir, '.claude', 'skills', 'vhk-auto', 'SKILL.md')
    fs.writeFileSync(
      target,
      `${legacy}<!-- vhk-agent-skill: vhk-auto@3 source=.agents/skills sha256=${hash} -->\n`,
      'utf-8',
    )

    const result = installAgentSkills(dir)

    expect(result.updated).toContain('.claude/skills/vhk-auto/SKILL.md')
    expect(fs.readFileSync(target, 'utf-8'))
      .toContain(`vhk-auto@${AGENT_SKILL_MANIFEST.bundleVersion}`)
    expect(result.backups.some((backup) => backup.endsWith(
      '.claude/skills/vhk-auto/SKILL.md',
    ))).toBe(true)
  })

  it('실제 v3 overnight 본문을 현재 관리 투영으로 갱신한다', () => {
    const dir = tmp('vhk-agent-source-v3-overnight-')
    copyCanonicalSource(dir)
    installAgentSkills(dir)
    const legacy = legacyV3OvernightBody()
    const hash = createHash('sha256').update(legacy, 'utf-8').digest('hex')
    expect(hash).toBe('2918e66c87a861da3fdf2880520638565ed6ea7a2f37ee7668ef47bade94c4c7')
    const target = path.join(dir, '.claude', 'skills', 'overnight-vhk-auto', 'SKILL.md')
    fs.writeFileSync(
      target,
      `${legacy}<!-- vhk-agent-skill: overnight-vhk-auto@3 source=.agents/skills sha256=${hash} -->\n`,
      'utf-8',
    )

    const result = installAgentSkills(dir)

    expect(result.updated).toContain('.claude/skills/overnight-vhk-auto/SKILL.md')
    expect(fs.readFileSync(target, 'utf-8')).toContain(
      `overnight-vhk-auto@${AGENT_SKILL_MANIFEST.bundleVersion}`,
    )
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

  it('VHK 정본의 manifest가 없어져도 소비자 저장소로 오인하지 않고 누락을 진단한다', () => {
    const dir = tmp('vhk-agent-source-missing-manifest-')
    copyCanonicalSource(dir)
    const canonical = path.join(dir, '.agents', 'skills', 'vhk-gate', 'SKILL.md')
    const before = fs.readFileSync(canonical, 'utf-8')
    removeFileSync(path.join(dir, '.agents', 'skills', 'manifest.json'))

    const check = checkAgentSkillSync(dir)

    expect(check.ok).toBe(false)
    expect(check.bundleDrift).toContain('.agents/skills/manifest.json')
    expect(() => installAgentSkills(dir)).toThrow('정본 저장소 무결성 실패')
    expect(fs.readFileSync(canonical, 'utf-8')).toBe(before)
    expect(fs.readFileSync(canonical, 'utf-8')).not.toContain('vhk-agent-skill:')
  })

  it('VHK 정본의 생성 번들이 없어지면 누락을 진단하고 정본을 관리본으로 바꾸지 않는다', () => {
    const dir = tmp('vhk-agent-source-missing-bundle-')
    copyCanonicalSource(dir)
    const canonical = path.join(dir, '.agents', 'skills', 'vhk-gate', 'SKILL.md')
    const before = fs.readFileSync(canonical, 'utf-8')
    removeFileSync(path.join(dir, 'src', 'lib', 'agent-skill-templates.ts'))

    const check = checkAgentSkillSync(dir)

    expect(check.ok).toBe(false)
    expect(check.bundleDrift).toContain('src/lib/agent-skill-templates.ts')
    expect(() => installAgentSkills(dir)).toThrow('정본 저장소 무결성 실패')
    expect(fs.readFileSync(canonical, 'utf-8')).toBe(before)
    expect(fs.readFileSync(canonical, 'utf-8')).not.toContain('vhk-agent-skill:')
  })

  it('VHK 생성 번들의 부모 junction도 정본 손상으로 차단한다', () => {
    const dir = tmp('vhk-agent-source-bundle-link-')
    const outside = tmp('vhk-agent-source-bundle-outside-')
    copyCanonicalSource(dir)
    fs.mkdirSync(path.join(outside, 'lib'), { recursive: true })
    fs.writeFileSync(
      path.join(outside, 'lib', 'agent-skill-templates.ts'),
      '// outside source fixture\n',
      'utf-8',
    )
    removeDirSync(path.join(dir, 'src'))
    try {
      fs.symlinkSync(outside, path.join(dir, 'src'), process.platform === 'win32' ? 'junction' : 'dir')
    } catch {
      return
    }

    const check = checkAgentSkillSync(dir)

    expect(check.ok).toBe(false)
    expect(check.bundleDrift).toContain('src/lib/agent-skill-templates.ts')
    expect(() => installAgentSkills(dir)).toThrow('src/lib/agent-skill-templates.ts')
  })

  it('VHK 정본 manifest와 생성 번들이 다르면 설치 전에 실패한다', () => {
    const dir = tmp('vhk-agent-source-manifest-drift-')
    copyCanonicalSource(dir)
    const manifestPath = path.join(dir, '.agents', 'skills', 'manifest.json')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
      bundleVersion: number
    }
    manifest.bundleVersion += 1
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')

    const check = checkAgentSkillSync(dir)

    expect(check.ok).toBe(false)
    expect(check.bundleDrift).toContain('.agents/skills/manifest.json')
    expect(() => installAgentSkills(dir)).toThrow('.agents/skills/manifest.json')
    expect(fs.existsSync(path.join(dir, '.claude', 'skills'))).toBe(false)
  })

  it('package 이름이 다른 VHK fork도 정본 sentinel이 있으면 손상 시 쓰지 않는다', () => {
    const dir = tmp('vhk-agent-source-fork-drift-')
    copyCanonicalSource(dir)
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      `${JSON.stringify({ name: '@sample/vhk-fork' }, null, 2)}\n`,
      'utf-8',
    )
    const manifestPath = path.join(dir, '.agents', 'skills', 'manifest.json')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
      bundleVersion: number
    }
    manifest.bundleVersion += 1
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')

    const check = checkAgentSkillSync(dir)

    expect(check.ok).toBe(false)
    expect(check.bundleDrift).toContain('.agents/skills/manifest.json')
    expect(() => installAgentSkills(dir)).toThrow('정본 저장소 무결성 실패')
    expect(fs.existsSync(path.join(dir, '.claude', 'skills'))).toBe(false)
  })

  it('설치 계획 뒤 정본이 바뀌면 오래된 생성 번들을 투영하지 않는다', () => {
    const dir = tmp('vhk-agent-source-concurrent-drift-')
    copyCanonicalSource(dir)
    const canonical = path.join(dir, '.agents', 'skills', 'vhk-auto', 'SKILL.md')
    const realRead = fs.readFileSync.bind(fs)
    let canonicalReads = 0
    vi.spyOn(fs, 'readFileSync').mockImplementation(((filePath: fs.PathOrFileDescriptor, options?: unknown) => {
      const content = realRead(filePath, options as BufferEncoding)
      if (path.resolve(String(filePath)) === path.resolve(canonical)) {
        canonicalReads += 1
        if (canonicalReads === 3) fs.appendFileSync(canonical, '\n동시 정본 변경\n', 'utf-8')
      }
      return content
    }) as typeof fs.readFileSync)

    expect(() => installAgentSkills(dir)).toThrow('정본 저장소 무결성 실패')
    expect(fs.existsSync(path.join(dir, '.claude', 'skills', 'vhk-auto', 'SKILL.md')))
      .toBe(false)
  })

  it('계획을 읽은 뒤 사용자 파일이 바뀌면 재검사해 보존 충돌로 끝낸다', () => {
    const dir = tmp()
    installAgentSkills(dir)
    const target = path.join(dir, '.agents', 'skills', 'vhk-gate', 'SKILL.md')
    const currentVersion = AGENT_SKILL_MANIFEST.bundleVersion
    fs.writeFileSync(
      target,
      fs.readFileSync(target, 'utf-8').replace(
        `vhk-gate@${currentVersion}`,
        `vhk-gate@${currentVersion - 1}`,
      ),
      'utf-8',
    )
    const userContent = '# concurrent user edit\n'
    const realRead = fs.readFileSync.bind(fs)
    let changed = false
    vi.spyOn(fs, 'readFileSync').mockImplementation(((filePath: fs.PathOrFileDescriptor, options?: unknown) => {
      const content = realRead(filePath, options as BufferEncoding)
      if (!changed && path.resolve(String(filePath)) === path.resolve(target)) {
        changed = true
        fs.writeFileSync(target, userContent, 'utf-8')
      }
      return content
    }) as typeof fs.readFileSync)

    const result = installAgentSkills(dir)

    expect(result.conflicts).toContain('.agents/skills/vhk-gate/SKILL.md')
    expect(realRead(target, 'utf-8')).toBe(userContent)
  })

  it('Windows의 일시적 EPERM이면 관리본 백업 이동을 제한 재시도한다', () => {
    const dir = tmp()
    installAgentSkills(dir)
    const target = path.join(dir, '.agents', 'skills', 'vhk-gate', 'SKILL.md')
    const currentVersion = AGENT_SKILL_MANIFEST.bundleVersion
    fs.writeFileSync(
      target,
      fs.readFileSync(target, 'utf-8').replace(
        `vhk-gate@${currentVersion}`,
        `vhk-gate@${currentVersion - 1}`,
      ),
      'utf-8',
    )
    const realRename = fs.renameSync.bind(fs)
    let attempts = 0
    vi.spyOn(fs, 'renameSync').mockImplementation((oldPath, newPath) => {
      attempts += 1
      if (attempts <= 2) throw Object.assign(new Error('fixture transient lock'), { code: 'EPERM' })
      realRename(oldPath, newPath)
    })

    const result = installAgentSkills(dir)

    expect(attempts).toBeGreaterThanOrEqual(3)
    expect(result.updated).toContain('.agents/skills/vhk-gate/SKILL.md')
  })

  it('지속되는 EPERM은 이전 관리본을 그대로 둔 채 실패로 전파한다', () => {
    const dir = tmp()
    installAgentSkills(dir)
    const target = path.join(dir, '.agents', 'skills', 'vhk-gate', 'SKILL.md')
    const currentVersion = AGENT_SKILL_MANIFEST.bundleVersion
    fs.writeFileSync(
      target,
      fs.readFileSync(target, 'utf-8').replace(
        `vhk-gate@${currentVersion}`,
        `vhk-gate@${currentVersion - 1}`,
      ),
      'utf-8',
    )
    const before = fs.readFileSync(target, 'utf-8')
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw Object.assign(new Error('fixture persistent lock'), { code: 'EPERM' })
    })

    expect(() => installAgentSkills(dir)).toThrow('fixture persistent lock')
    expect(fs.readFileSync(target, 'utf-8')).toBe(before)
  })

  it('갱신 이동 직전 동시 편집을 원래 경로에 복구한다', () => {
    const dir = tmp()
    installAgentSkills(dir)
    const target = path.join(dir, '.agents', 'skills', 'vhk-gate', 'SKILL.md')
    const currentVersion = AGENT_SKILL_MANIFEST.bundleVersion
    fs.writeFileSync(
      target,
      fs.readFileSync(target, 'utf-8').replace(
        `vhk-gate@${currentVersion}`,
        `vhk-gate@${currentVersion - 1}`,
      ),
      'utf-8',
    )
    const userContent = '# concurrent user edit before rename\n'
    const realRename = fs.renameSync.bind(fs)
    let changed = false
    vi.spyOn(fs, 'renameSync').mockImplementation((oldPath, newPath) => {
      if (!changed && path.resolve(String(oldPath)) === path.resolve(target)) {
        changed = true
        fs.writeFileSync(target, userContent, 'utf-8')
      }
      realRename(oldPath, newPath)
    })

    const result = installAgentSkills(dir)

    expect(result.conflicts).toContain('.agents/skills/vhk-gate/SKILL.md')
    expect(fs.readFileSync(target, 'utf-8')).toBe(userContent)
    expect(result.backups).toHaveLength(0)
  })

  it('백업을 읽지 못해도 이전 관리본을 활성 경로에 복구하고 실패를 전파한다', () => {
    const dir = tmp()
    installAgentSkills(dir)
    const target = path.join(dir, '.agents', 'skills', 'vhk-gate', 'SKILL.md')
    const currentVersion = AGENT_SKILL_MANIFEST.bundleVersion
    fs.writeFileSync(
      target,
      fs.readFileSync(target, 'utf-8').replace(
        `vhk-gate@${currentVersion}`,
        `vhk-gate@${currentVersion - 1}`,
      ),
      'utf-8',
    )
    const before = fs.readFileSync(target, 'utf-8')
    const realRead = fs.readFileSync.bind(fs)
    vi.spyOn(fs, 'readFileSync').mockImplementation(((filePath: fs.PathOrFileDescriptor, options?: unknown) => {
      if (String(filePath).includes(`${path.sep}.vhk${path.sep}backups${path.sep}`)) {
        throw Object.assign(new Error('fixture backup read denied'), { code: 'EACCES' })
      }
      return realRead(filePath, options as BufferEncoding)
    }) as typeof fs.readFileSync)

    expect(() => installAgentSkills(dir)).toThrow('활성 경로 복구됨')
    expect(realRead(target, 'utf-8')).toBe(before)
  })

  it('백업 hard link가 불가능해도 rename으로 사용자 편집을 활성 경로에 복구한다', () => {
    const dir = tmp()
    installAgentSkills(dir)
    const target = path.join(dir, '.agents', 'skills', 'vhk-gate', 'SKILL.md')
    const currentVersion = AGENT_SKILL_MANIFEST.bundleVersion
    fs.writeFileSync(
      target,
      fs.readFileSync(target, 'utf-8').replace(
        `vhk-gate@${currentVersion}`,
        `vhk-gate@${currentVersion - 1}`,
      ),
      'utf-8',
    )
    const userContent = '# concurrent user edit before rename\n'
    const realRename = fs.renameSync.bind(fs)
    let changed = false
    vi.spyOn(fs, 'renameSync').mockImplementation((oldPath, newPath) => {
      if (!changed && path.resolve(String(oldPath)) === path.resolve(target)) {
        changed = true
        fs.writeFileSync(target, userContent, 'utf-8')
      }
      realRename(oldPath, newPath)
    })
    vi.spyOn(fs, 'linkSync').mockImplementation(() => {
      throw Object.assign(new Error('fixture hard-link unsupported'), { code: 'EPERM' })
    })

    const result = installAgentSkills(dir)

    expect(result.conflicts).toContain('.agents/skills/vhk-gate/SKILL.md')
    expect(fs.readFileSync(target, 'utf-8')).toBe(userContent)
    expect(result.backups).toHaveLength(0)
  })

  it('Agent Skill 디스크 쓰기 실패를 사용자 충돌로 숨기지 않고 전파한다', () => {
    const dir = tmp()
    const realMkdir = fs.mkdirSync.bind(fs)
    vi.spyOn(fs, 'mkdirSync').mockImplementation(((dirPath: fs.PathLike, options?: fs.MakeDirectoryOptions) => {
      if (path.resolve(String(dirPath)).endsWith(path.join('.agents', 'skills', 'vhk-gate'))) {
        throw Object.assign(new Error('fixture disk full'), { code: 'ENOSPC' })
      }
      return realMkdir(dirPath, options)
    }) as typeof fs.mkdirSync)

    expect(() => installAgentSkills(dir)).toThrow('fixture disk full')
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
