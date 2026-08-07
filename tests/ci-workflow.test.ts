import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parse } from 'yaml'
import { CI_WORKFLOW_TEMPLATE } from '../src/templates/ci-workflow.js'
import { init, installCiWorkflow } from '../src/commands/init.js'
import { setSink } from '../src/utils/logger.js'

type WorkflowStep = {
  name?: string
  run?: string
}

type WorkflowDocument = {
  name?: string
  on?: Record<string, unknown>
  permissions?: Record<string, string>
  jobs?: Record<string, {
    name?: string
    steps?: WorkflowStep[]
  }>
}

describe('CI 워크플로 템플릿', () => {
  it('PR 필수 검사에 필요한 검증·규칙·공개 경계를 한 gate에 묶는다', () => {
    const source = CI_WORKFLOW_TEMPLATE('2.14.0')
    const workflow = parse(source) as WorkflowDocument
    const gate = workflow.jobs?.gate
    const runs = (gate?.steps ?? []).map((step) => step.run).filter(Boolean).join('\n')

    expect(workflow.name).toBe('VHK Required Check')
    expect(workflow.on).toHaveProperty('pull_request')
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(gate?.name).toBe('VHK Gate')
    expect(runs).toContain('npx --yes @byh3071/vhk@2.14.0 verify')
    expect(runs).toContain('npx --yes @byh3071/vhk@2.14.0 sync --check')
    expect(runs).toContain('npx --yes @byh3071/vhk@2.14.0 check')
    expect(runs).toContain('npx --yes @byh3071/vhk@2.14.0 secure scan')
    expect(runs).toContain('npm run boundary:check --if-present')
    expect(source).not.toContain('continue-on-error')
  })

  it('잘못된 버전 문자열을 workflow 명령에 넣지 않는다', () => {
    const source = CI_WORKFLOW_TEMPLATE('2.14.0\n      - run: echo injected')
    expect(source).not.toContain('echo injected')
    expect(source).toContain('@byh3071/vhk@latest verify')
  })
})

describe('init --ci 워크플로 설치', () => {
  let dir: string
  let originalCwd: string
  let restoreSink: (() => void) | undefined
  let logLines: string[]

  beforeEach(() => {
    originalCwd = process.cwd()
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-init-ci-'))
    process.chdir(dir)
    process.exitCode = 0
    logLines = []
    restoreSink = setSink((line) => logLines.push(line))
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    restoreSink?.()
    process.chdir(originalCwd)
    process.exitCode = 0
    fs.rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('--ci일 때 .github/workflows/vhk-gate.yml을 만든다', async () => {
    await init({
      yes: true,
      ci: true,
      name: 'sample-app',
      description: '샘플 앱',
      type: 'cli',
    })

    const workflowPath = path.join(dir, '.github', 'workflows', 'vhk-gate.yml')
    expect(fs.existsSync(workflowPath)).toBe(true)
    expect(fs.readFileSync(workflowPath, 'utf8')).toContain('name: VHK Required Check')
  })

  it('--ci가 없으면 워크플로를 만들지 않는다', async () => {
    await init({
      yes: true,
      name: 'sample-app',
      description: '샘플 앱',
      type: 'cli',
    })

    expect(fs.existsSync(path.join(dir, '.github', 'workflows', 'vhk-gate.yml'))).toBe(false)
  })

  it('기존 워크플로가 하나라도 있으면 아무 파일도 덮어쓰거나 추가하지 않는다', () => {
    const existingPath = path.join(dir, '.github', 'workflows', 'ci.yaml')
    fs.mkdirSync(path.dirname(existingPath), { recursive: true })
    fs.writeFileSync(existingPath, 'name: Existing\n', 'utf8')

    const result = installCiWorkflow(dir, '2.14.0')

    expect(result.status).toBe('existing')
    expect(result.existingWorkflows).toEqual(['.github/workflows/ci.yaml'])
    expect(fs.readFileSync(existingPath, 'utf8')).toBe('name: Existing\n')
    expect(fs.existsSync(path.join(dir, '.github', 'workflows', 'vhk-gate.yml'))).toBe(false)
  })

  it('init --ci가 기존 워크플로를 보존하고 병합 방법을 안내한다', async () => {
    const existingPath = path.join(dir, '.github', 'workflows', 'ci.yml')
    fs.mkdirSync(path.dirname(existingPath), { recursive: true })
    fs.writeFileSync(existingPath, 'name: Existing\n', 'utf8')

    await init({
      yes: true,
      ci: true,
      name: 'sample-app',
      description: '샘플 앱',
      type: 'cli',
    })

    expect(fs.readFileSync(existingPath, 'utf8')).toBe('name: Existing\n')
    expect(logLines.join('\n')).toContain('VHK Gate 단계를 기존 파일에 병합하세요')
    expect(logLines.join('\n')).toContain('npx --yes @byh3071/vhk@')
    expect(logLines.join('\n')).toContain('verify')
    expect(logLines.join('\n')).toContain('Settings → Rules')
  })

  it('워크플로 경로를 만들 수 없으면 오류를 알리고 실패로 끝낸다', async () => {
    fs.mkdirSync(path.join(dir, '.github'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.github', 'workflows'), 'not-a-directory', 'utf8')

    await init({
      yes: true,
      ci: true,
      name: 'sample-app',
      description: '샘플 앱',
      type: 'cli',
    })

    expect(process.exitCode).toBe(1)
    expect(logLines.join('\n')).toContain('PR 검사 파일을 만들지 못했습니다')
  })

  it('최상위 init 명령에 새 명령이 아닌 --ci 플래그가 등록돼 있다', () => {
    const indexSource = fs.readFileSync(path.join(originalCwd, 'src', 'index.ts'), 'utf8')
    const initBlock = indexSource.slice(
      indexSource.indexOf(".command('init')"),
      indexSource.indexOf('// 3단계 — 오늘 정리'),
    )
    expect(initBlock).toContain(".option('--ci'")
  })
})

describe('VHK 자기 CI', () => {
  it('규칙 전파와 연결 검사를 PR 차단 단계에서 실행한다', () => {
    const source = fs.readFileSync(path.join(process.cwd(), '.github', 'workflows', 'ci.yml'), 'utf8')
    expect(source).toContain('node dist/index.js sync --check')
    expect(source).toContain('node dist/index.js check')
    expect(source).not.toContain('goal 완료 게이트)는 CI 미연결')
  })
})
