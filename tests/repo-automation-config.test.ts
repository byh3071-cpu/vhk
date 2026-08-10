import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sharedAutomationFiles = [
  '.agents/skills/auto-merge/SKILL.md',
  '.agents/skills/auto-merge/agents/openai.yaml',
  '.agents/skills/overnight-vhk-auto/SKILL.md',
  '.agents/skills/vhk-auto/SKILL.md',
  '.claude/skills/overnight-vhk-auto/SKILL.md',
  '.claude/agents/docs/prd-generator.md',
  '.codex/hooks.json',
  'scripts/auto_pr_goal.ps1',
  'paseo.json',
]

interface HookCommand {
  type: string
  command: string
  commandWindows?: string
}

interface HookGroup {
  matcher?: string
  hooks: HookCommand[]
}

interface CodexHooks {
  hooks: Record<string, HookGroup[]>
}

function isTracked(file: string): boolean {
  return spawnSync('git', ['ls-files', '--error-unmatch', '--', file], { encoding: 'utf8' }).status === 0
}

function readHooks(): HookCommand[] {
  const config = JSON.parse(readFileSync('.codex/hooks.json', 'utf8')) as CodexHooks
  return Object.values(config.hooks).flatMap((groups) => groups.flatMap((group) => group.hooks))
}

function expectInOrder(content: string, fragments: string[]): void {
  let previous = -1
  for (const fragment of fragments) {
    const current = content.indexOf(fragment, previous + 1)
    expect(current, `다음 계약이 앞 단계 뒤에 있어야 함: ${fragment}`).toBeGreaterThan(previous)
    previous = current
  }
}

describe('공용 에이전트 자동화 설정', () => {
  it('PC 종속 절대경로를 포함하지 않는다', () => {
    const hostPath = /(?:[A-Za-z]:[\\/]|\\\\[^\\/\s]+[\\/]|\/Users\/|\/home\/)/

    for (const file of sharedAutomationFiles) {
      expect(readFileSync(file, 'utf8'), `${file}에 PC 종속 경로가 있음`).not.toMatch(hostPath)
    }
  })

  it('야간 실행기는 현재 Goal과 저장소에 존재하는 계약만 사용한다', () => {
    const file = '.agents/skills/overnight-vhk-auto/SKILL.md'
    const content = readFileSync(file, 'utf8')
    const projectRefs = [...content.matchAll(/`((?:\.[Cc]odex|\.agents|docs|scripts)\/[^`\s]+)`/g)].map(
      (match) => match[1],
    )

    expect(content).toContain('vhk goal next')
    expect(content).not.toMatch(/Wave [A-Z]|105→107/)
    for (const ref of projectRefs) {
      expect(isTracked(ref), `${file}이 추적되지 않는 ${ref}를 참조함`).toBe(true)
    }
  })

  it('일회용 진단 에이전트를 배포 설정에 포함하지 않는다', () => {
    expect(isTracked('.codex/agents/memtest.toml')).toBe(false)
  })

  it('vhk-auto는 비추적 devlog를 기록하고 스테이지하지 않는다', () => {
    const content = readFileSync('.agents/skills/vhk-auto/SKILL.md', 'utf8')

    expect(content).toContain('docs/devlog/<오늘날짜>-autopilot.md')
    expect(content).toContain('이 경로는 **비추적**이라 `git add` 하지 않는다')
    expect(content).toContain('codex.cmd review --uncommitted')
    expect(content).toContain('POSIX에서는 `codex review --uncommitted`')
    expect(content).not.toContain('docs/log/<오늘날짜>-autopilot.md')
    expect(content.match(/vhk autonomy-log --event blocked/g)).toHaveLength(2)
    expect(content).toContain('같은 호출에서 실패 원인을 수정하고 `vhk verify`를 한 번 다시 실행')
    expectInOrder(content, [
      '**런 시작 기록**',
      'vhk autonomy-log --event start',
      '같은 호출에서 실패 원인을 수정하고 `vhk verify`를 한 번 다시 실행',
      'vhk autonomy-log --event hardstop',
      '**재검증 전 중단·review 실패·그 밖의 start 이후 오류**',
      'vhk autonomy-log --event blocked',
    ])
  })

  it('overnight 실행기는 저장소에 추적되는 push+PR 전용 래퍼를 사용한다', () => {
    const script = 'scripts/auto_pr_goal.ps1'

    expect(isTracked(script)).toBe(true)
    for (const file of [
      '.agents/skills/overnight-vhk-auto/SKILL.md',
      '.claude/skills/overnight-vhk-auto/SKILL.md',
    ]) {
      const content = readFileSync(file, 'utf8')
      expect(content).toContain(script)
      expect(content).toContain('powershell -NoProfile -ExecutionPolicy Bypass -File')
      expect(content).not.toContain('VHK_AUTO_PR_SCRIPT')
    }

    const content = readFileSync(script, 'utf8')
    expect(content).toContain('[string]$BaseBranch = \'main\'')
    expect(content).toContain('ConvertFrom-Json')
    expect(content).toContain("'push'")
    expect(content).toContain("'pr', 'create'")
    expect(content).not.toMatch(/gh\s+pr\s+merge|npm\s+publish|--force/)

    const result = spawnSync(process.execPath, ['scripts/verify-auto-pr-goal.mjs'], {
      encoding: 'utf8',
    })
    expect(result.status, result.stderr || result.stdout).toBe(0)
    const report = JSON.parse(result.stdout) as {
      supported: boolean
      created?: boolean
      pushed?: boolean
      hardStopBlocked?: boolean
      nestedRootBlocked?: boolean
      mainBlocked?: boolean
      dirtyBlocked?: boolean
      existingReused?: boolean
      baseScoped?: boolean
    }
    if (process.platform === 'win32') {
      expect(report).toEqual({
        supported: true,
        created: true,
        pushed: true,
        hardStopBlocked: true,
        nestedRootBlocked: true,
        mainBlocked: true,
        dirtyBlocked: true,
        existingReused: true,
        baseScoped: true,
      })
    } else {
      expect(report).toEqual({ supported: false })
    }
  })

  it('auto-merge는 저장소를 동적으로 찾고 리뷰 스레드를 끝까지 읽는다', () => {
    const content = readFileSync('.agents/skills/auto-merge/SKILL.md', 'utf8')

    expect(content).toContain('$auto-merge')
    expect(content).toContain('gh repo view --json nameWithOwner')
    expect(content).toContain('hasNextPage')
    expect(content).toContain('endCursor')
    expect(content).toContain('codex.cmd review')
    expect(content).toContain('POSIX에서는 `codex review`')
    expect(content).toContain('git fetch origin main')
    expect(content).toContain('git worktree add --detach')
    expect(content).toContain('git worktree remove')
    expect(content).toContain('--limit 1000')
    expect(content).toContain('--base main')
    expect(content).toContain('headRefOid')
    expect(content).toContain('baseRefName')
    expect(content).toContain('--match-head-commit <headRefOid>')
    expect(content).toContain('gh pr view <n> --json state,labels,headRefOid,baseRefName')
    expectInOrder(content, [
      'git rev-parse refs/vhk-auto-merge/pr-<n>',
      '`git rev-parse` 결과가 수집 시 저장한 `<headRefOid>`와 같은 경우에만',
      'git worktree add --detach',
      'gh pr view <n> --json state,labels,headRefOid,baseRefName',
      'gh pr merge <n> --squash --match-head-commit <headRefOid>',
    ])
    expect(content).not.toContain('worktree 생성 불필요')
    expect(content).not.toMatch(/repository\(owner:"|\/loop|\/code-review|\bGlob\b|\bBash\b|\bAgent\b/)

    const metadata = readFileSync('.agents/skills/auto-merge/agents/openai.yaml', 'utf8')
    expect(metadata).toContain('allow_implicit_invocation: false')
    expect(metadata).toContain('$auto-merge')
  })

  it('Codex 훅은 Git 루트의 추적 스크립트를 하위 디렉터리에서도 실행한다', () => {
    const commands = readHooks()

    expect(commands.length).toBeGreaterThan(0)
    for (const hook of commands) {
      expect(hook.command).toContain('git rev-parse --show-toplevel')
      expect(hook.commandWindows).toContain('git rev-parse --show-toplevel')
      expect(hook.command).toContain('cd "$repo_root"')
      expect(hook.commandWindows).toContain('Set-Location -LiteralPath $repoRoot')

      const command = process.platform === 'win32' ? hook.commandWindows : hook.command
      const result = process.platform === 'win32'
        ? spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', command ?? ''], {
            cwd: join(process.cwd(), 'src'),
            encoding: 'utf8',
          })
        : spawnSync('sh', ['-c', command], {
            cwd: join(process.cwd(), 'src'),
            encoding: 'utf8',
          })

      expect(result.status, result.stderr || result.stdout).toBe(0)
    }
  })

  it('Codex hook은 하위 디렉터리에서도 루트 HARD_STOP과 코드 변경을 실제로 감지한다', () => {
    const result = spawnSync(process.execPath, ['scripts/verify-codex-hooks.mjs'], {
      encoding: 'utf8',
    })

    expect(result.status, result.stderr || result.stdout).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({
      hardStopBlocked: true,
      reminderShown: true,
      devlogSuppressed: true,
    })
  })

  it('PRD 에이전트는 저장소의 기존 문서 경로 관례를 따른다', () => {
    const content = readFileSync('.claude/agents/docs/prd-generator.md', 'utf8')

    expect(content).toContain('docs/PRD-<슬러그>.md')
    expect(content).not.toContain('docs/prd/PRD-<슬러그>.md')
  })

  it('Paseo worktree 설정은 잠금파일 기반 설치만 수행한다', () => {
    const paseo = JSON.parse(readFileSync('paseo.json', 'utf8')) as {
      worktree?: { setup?: string }
    }

    expect(paseo.worktree?.setup).toBe('pnpm install --frozen-lockfile')
  })
})
