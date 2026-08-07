import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { check } from '../src/commands/check.js'
import { findRuleCheckScript } from '../src/commands/goal.js'
import { parseRuleDeclarations } from '../src/lib/rules-parser.js'

function makeProject(rules: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-rule-binding-'))
  fs.mkdirSync(path.join(dir, 'src'))
  fs.mkdirSync(path.join(dir, 'scripts'))
  fs.writeFileSync(path.join(dir, 'RULES.md'), rules, 'utf-8')
  return dir
}

async function runJson(dir: string): Promise<Record<string, unknown>> {
  const previousCwd = process.cwd()
  process.chdir(dir)
  const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    await check({ json: true })
    const output = spy.mock.calls.map((call) => String(call[0])).join('\n')
    return JSON.parse(output) as Record<string, unknown>
  } finally {
    spy.mockRestore()
    process.chdir(previousCwd)
  }
}

describe('RULES.md 검사 연결 표시', () => {
  const originalCwd = process.cwd()

  afterEach(() => {
    process.chdir(originalCwd)
    process.exitCode = 0
    vi.restoreAllMocks()
  })

  it('표시를 해석하고 설명에서는 표시를 제거한다', () => {
    const dir = makeProject('## 코딩 규칙\n- 안전하게 실행 <!-- vhk:check=safe-exec-1 -->\n')
    const [declaration] = parseRuleDeclarations(path.join(dir, 'RULES.md'))

    expect(declaration.checkId).toBe('safe-exec-1')
    expect(declaration.description).toBe('안전하게 실행')
    expect(declaration.bindingError).toBeUndefined()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('영문 소문자·숫자·하이픈 밖의 ID를 거부하고 exit 1을 낸다', async () => {
    const dir = makeProject('## 코딩 규칙\n- 안전하게 실행 <!-- vhk:check=Bad_ID -->\n')
    const [declaration] = parseRuleDeclarations(path.join(dir, 'RULES.md'))

    expect(declaration.checkId).toBeUndefined()
    expect(declaration.bindingError).toBe('invalid-id')
    expect(declaration.invalidCheckId).toBe('Bad_ID')
    const result = await runJson(dir)
    expect(result.errors).toBe(1)
    expect(process.exitCode).toBe(1)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('표시는 있지만 검사 파일이 없으면 오류와 exit 1을 낸다', async () => {
    const dir = makeProject('## 코딩 규칙\n- 안전하게 실행 <!-- vhk:check=missing -->\n')
    const result = await runJson(dir)

    expect(result.errors).toBe(1)
    expect(result.declaredRules).toBe(1)
    expect(result.checkedRules).toBe(0)
    expect(result.coveragePercent).toBe(0)
    expect(process.exitCode).toBe(1)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('.mjs가 없을 때 .sh 파일을 보조 검사로 찾는다', () => {
    const dir = makeProject('## 코딩 규칙\n- 셸 검사 <!-- vhk:check=shell-only -->\n')
    fs.writeFileSync(path.join(dir, 'scripts', 'check-rule-shell-only.sh'), 'exit 0\n', 'utf-8')

    expect(findRuleCheckScript('shell-only', dir)).toBe(path.join('scripts', 'check-rule-shell-only.sh'))
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('스크립트 탐색 단계에서도 경로로 바뀔 수 있는 ID를 거부한다', () => {
    const dir = makeProject('## 코딩 규칙\n- 안전 규칙\n')
    expect(findRuleCheckScript('../outside', dir)).toBeNull()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('연결 검사의 성공·실패를 실행하고 실패 시 exit 1을 낸다', async () => {
    const dir = makeProject([
      '## 코딩 규칙',
      '- 성공 규칙 <!-- vhk:check=pass -->',
      '- 실패 규칙 <!-- vhk:check=fail -->',
      '',
    ].join('\n'))
    fs.writeFileSync(
      path.join(dir, 'scripts', 'check-rule-pass.mjs'),
      "import fs from 'node:fs'; fs.writeFileSync('binding-ran.txt', 'yes')\n",
      'utf-8'
    )
    fs.writeFileSync(path.join(dir, 'scripts', 'check-rule-pass.sh'), 'exit 1\n', 'utf-8')
    fs.writeFileSync(path.join(dir, 'scripts', 'check-rule-fail.mjs'), 'process.exitCode = 2\n', 'utf-8')

    const result = await runJson(dir)

    expect(fs.readFileSync(path.join(dir, 'binding-ran.txt'), 'utf-8')).toBe('yes')
    expect(result.declaredRules).toBe(2)
    expect(result.checkedRules).toBe(2)
    expect(result.uncheckedRules).toBe(0)
    expect(result.coveragePercent).toBe(100)
    expect(result.errors).toBe(1)
    expect(process.exitCode).toBe(1)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('기존 자동 검사와 연결 검사가 같은 선언이면 검사 비율에서 한 번만 센다', async () => {
    const dir = makeProject([
      '## 코딩 규칙',
      '- `console.log` 금지 <!-- vhk:check=no-console -->',
      '- 사람이 확인할 규칙',
      '',
    ].join('\n'))
    fs.writeFileSync(path.join(dir, 'scripts', 'check-rule-no-console.mjs'), '', 'utf-8')

    const result = await runJson(dir)

    expect(result.declaredRules).toBe(2)
    expect(result.checkedRules).toBe(1)
    expect(result.uncheckedRules).toBe(1)
    expect(result.coveragePercent).toBe(50)
    expect(process.exitCode ?? 0).toBe(0)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
