import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// 클립보드는 mock — 복사 호출 여부와 전달된 프롬프트 내용만 검증.
const mockCopy = vi.fn(() => true)
vi.mock('../src/lib/clipboard.js', () => ({
  copyToClipboard: (...a: unknown[]) => mockCopy(...a),
}))

// git status 는 safeExecFile mock 으로 고정. work 가 commit/stash/reset 을 부르지 않음도 검증.
const mockSafeExecFile = vi.fn(() => ({ ok: true, out: ' M src/x.ts' }))
vi.mock('../src/lib/exec.js', () => ({
  safeExecFile: (...a: unknown[]) => mockSafeExecFile(...a),
}))

// context() 는 실제 파일 스캔/생성 → mock. work 흐름엔 호출 여부만 중요.
const mockContext = vi.fn(async () => {})
vi.mock('../src/commands/context.js', () => ({
  context: (...a: unknown[]) => mockContext(...a),
}))

function tmpProject(label: string): string {
  const dir = join(
    tmpdir(),
    `vhk-work-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  )
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'CLAUDE.md'), '# 기록 규칙 (vhk)\n', 'utf-8')
  return dir
}

function makeGoal(dir: string, id: number, status: string): void {
  mkdirSync(join(dir, 'goals'), { recursive: true })
  writeFileSync(
    join(dir, 'goals', `${id}-test.md`),
    `---\nvhk_format: 1\ntype: goal\nid: ${id}\ntitle: 작업기능\nstatus: ${status}\npriority: P0\n---\nbody\n`,
    'utf-8'
  )
}

describe('work — 프롬프트 빌더', () => {
  it('buildStartPrompt — 규칙 우선순위·안전 지시·git 상태 포함', async () => {
    const { buildStartPrompt } = await import('../src/commands/work.js')
    const p = buildStartPrompt(' M a.ts', 'Goal 1 — x')
    expect(p).toContain('CLAUDE.md 를 1순위')
    expect(p).toContain('AGENTS.md 는 Codex')
    expect(p).toContain('3단계 이하')
    expect(p).toContain('승인하기 전에는')
    expect(p).toContain(' M a.ts')
    expect(p).toContain('Goal 1 — x')
    // SoT 최적화 1층: 작업 전 Source of Truth 체크 블록이 프롬프트에 포함되어야 함.
    expect(p).toContain('Source of Truth')
    expect(p).toContain('RULES.md 한 곳')
  })

  it('buildStartPrompt — git 비면 "(변경 없음)"', async () => {
    const { buildStartPrompt } = await import('../src/commands/work.js')
    expect(buildStartPrompt('', '정의된 goal 없음')).toContain('(변경 없음)')
  })

  it('buildHandoffPrompt — 인수인계 요구 항목 전부 포함', async () => {
    const { buildHandoffPrompt } = await import('../src/commands/work.js')
    const p = buildHandoffPrompt(' M a.ts')
    expect(p).toContain('완료된 일 / 미완료된 일')
    expect(p).toContain('미실행')
    expect(p).toContain('docs/state/next-task.md')
    expect(p).toContain('커밋 가능한 상태')
    expect(p).toContain('vhk goal done 실행 금지')
    expect(p).toContain('git commit')
  })

  it('buildHandoffPrompt — 문서 후보 있으면 미기록 ADR/트러블슈팅 섹션 주입 (RFC 0051)', async () => {
    const { buildHandoffPrompt } = await import('../src/commands/work.js')
    const p = buildHandoffPrompt(' M package.json', {
      adr: [{ title: '의존성 변경', context: 'package.json 변경', files: ['package.json'] }],
      troubleshooting: [{ hash: 'abc1234def', message: 'fix: 크래시 수정' }],
    })
    expect(p).toContain('미기록 의사결정/에러 후보')
    expect(p).toContain('의존성 변경')
    expect(p).toContain('fix: 크래시 수정')
    // 기존 인수인계 항목은 그대로 유지
    expect(p).toContain('완료된 일 / 미완료된 일')
  })

  it('buildHandoffPrompt — 후보 없으면 섹션 미삽입(기존 시그니처 호환)', async () => {
    const { buildHandoffPrompt } = await import('../src/commands/work.js')
    const p = buildHandoffPrompt(' M a.ts')
    expect(p).not.toContain('미기록 의사결정/에러 후보')
  })
})

describe('work / workHandoff — 동작·안전장치', () => {
  let origCwd: string
  beforeEach(() => {
    origCwd = process.cwd()
    vi.clearAllMocks()
    mockCopy.mockReturnValue(true)
    mockSafeExecFile.mockReturnValue({ ok: true, out: ' M src/x.ts' })
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    process.chdir(origCwd)
    vi.restoreAllMocks()
  })

  it('work — 시작 프롬프트를 클립보드에 복사', async () => {
    const dir = tmpProject('start')
    makeGoal(dir, 1, 'IN_PROGRESS')
    process.chdir(dir)
    try {
      const { work } = await import('../src/commands/work.js')
      await work()
      expect(mockCopy).toHaveBeenCalledTimes(1)
      expect(String(mockCopy.mock.calls[0][0])).toContain('CLAUDE.md 를 1순위')
      expect(String(mockCopy.mock.calls[0][0])).toContain('Goal 1 — 작업기능')
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('work — HARD_STOP 활성 시 중단(클립보드 미호출)', async () => {
    const dir = tmpProject('hardstop')
    mkdirSync(join(dir, '.vhk'), { recursive: true })
    writeFileSync(join(dir, '.vhk', 'HARD_STOP'), '2026-06-05\nauto: test\n', 'utf-8')
    process.chdir(dir)
    try {
      const { work } = await import('../src/commands/work.js')
      await work()
      expect(mockCopy).not.toHaveBeenCalled()
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('workHandoff — 인수인계 프롬프트 복사 + commit/stash/reset 미호출', async () => {
    const dir = tmpProject('handoff')
    process.chdir(dir)
    try {
      const { workHandoff } = await import('../src/commands/work.js')
      await workHandoff()
      expect(mockCopy).toHaveBeenCalledTimes(1)
      expect(String(mockCopy.mock.calls[0][0])).toContain('완료된 일 / 미완료된 일')
      // 안전: safeExecFile 은 git status 만 — 변경 파괴 명령 인자로 호출 안 됨
      for (const call of mockSafeExecFile.mock.calls) {
        const args = (call[1] ?? []) as string[]
        expect(args).not.toContain('commit')
        expect(args).not.toContain('stash')
        expect(args).not.toContain('reset')
      }
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('work — 클립보드 실패해도 .vhk/work-prompt.md 사본 저장(폴백)', async () => {
    const dir = tmpProject('fallback')
    makeGoal(dir, 0, 'NOT_STARTED')
    mockCopy.mockReturnValue(false)
    process.chdir(dir)
    try {
      const { existsSync } = await import('node:fs')
      const { work } = await import('../src/commands/work.js')
      await work()
      expect(existsSync(join(dir, '.vhk', 'work-prompt.md'))).toBe(true)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // ── 방향 3-②: mission 미설정 경고(block 아님 — exit 0 유지) ──
  it('work — mission 없으면 경고 출력 + exit 0 (block 아님)', async () => {
    const dir = tmpProject('mission-unset')
    makeGoal(dir, 1, 'IN_PROGRESS')
    const logs: string[] = []
    ;(console.log as unknown as { mockImplementation: (f: (m?: unknown) => void) => void })
      .mockImplementation((m?: unknown) => { logs.push(String(m ?? '')) })
    process.exitCode = 0
    process.chdir(dir)
    try {
      const { ko } = await import('../src/i18n/ko.js')
      const { work } = await import('../src/commands/work.js')
      await work()
      expect(logs.some((l) => l.includes(ko.work.missionUnset))).toBe(true)
      expect(process.exitCode ?? 0).toBe(0) // 경고일 뿐 — exit 0
    } finally {
      process.exitCode = 0
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('work — mission 있으면 경고 없음', async () => {
    const dir = tmpProject('mission-set')
    makeGoal(dir, 1, 'IN_PROGRESS')
    const logs: string[] = []
    ;(console.log as unknown as { mockImplementation: (f: (m?: unknown) => void) => void })
      .mockImplementation((m?: unknown) => { logs.push(String(m ?? '')) })
    process.chdir(dir)
    try {
      const { writeMission, scaffoldMission } = await import('../src/commands/mission.js')
      writeMission(dir, scaffoldMission('app'))
      const { ko } = await import('../src/i18n/ko.js')
      const { work } = await import('../src/commands/work.js')
      await work()
      expect(logs.some((l) => l.includes(ko.work.missionUnset))).toBe(false)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
