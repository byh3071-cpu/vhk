import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const bin = path.join(process.cwd(), 'dist', 'index.js')
const tempDirs: string[] = []

function makeProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-start-stack-'))
  tempDirs.push(dir)
  return dir
}

function runStart(dir: string, stack?: string) {
  const args = [
    bin,
    'start',
    '--yes',
    '--name',
    'sample-app',
    '--description',
    'sample',
    '--type',
    'webapp',
  ]
  if (stack !== undefined) args.push('--stack', stack)
  return spawnSync(process.execPath, args, {
    cwd: dir,
    encoding: 'utf-8',
    env: { ...process.env, CI: '1' },
  })
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('실제 CLI start 기술 스택 계약', () => {
  it('--stack 지정값을 확정하고 preset보다 우선한다', () => {
    const dir = makeProject()
    const result = runStart(dir, 'Vite, React, TypeScript')
    const output = String(result.stdout ?? '') + String(result.stderr ?? '')
    expect(result.status, output).toBe(0)

    const rules = fs.readFileSync(path.join(dir, 'RULES.md'), 'utf-8')
    expect(rules).toContain('기술 스택 상태: 확정')
    expect(rules).toContain('Vite')
    expect(rules).not.toContain('Next.js')
    expect(fs.readFileSync(path.join(dir, 'docs', 'ARCHITECTURE.md'), 'utf-8')).toContain('기술 스택 상태: 확정')
    const context = fs.readFileSync(path.join(dir, '.vhk', 'context.md'), 'utf-8')
    expect(context).toContain('기술 스택 상태: 확정')
    expect(context).toContain([
      '### 선언된 기술 스택 (RULES.md)',
      '',
      '- Vite',
      '- React',
      '- TypeScript',
      '',
      '### 실제 감지된 기술 스택 (package.json)',
    ].join('\n'))
  })

  it('--stack 미지정 preset은 후보로 남아 첫 세션 확인 대상이 된다', () => {
    const dir = makeProject()
    const result = runStart(dir)
    const output = String(result.stdout ?? '') + String(result.stderr ?? '')
    expect(result.status, output).toBe(0)

    for (const file of ['RULES.md', 'AGENTS.md', 'docs/ARCHITECTURE.md', '.vhk/context.md']) {
      expect(fs.readFileSync(path.join(dir, file), 'utf-8'), file).toContain('후보, 첫 세션에서 확정')
    }
    expect(fs.readFileSync(path.join(dir, '.vhk', 'hooks', 'customization-check.mjs'), 'utf-8'))
      .toContain('[0단계 — 기술 스택]')
  })

  it('빈 --stack은 거짓 확정하지 않고 후보 안내 후 계속한다', () => {
    const dir = makeProject()
    const result = runStart(dir, '   ')
    const output = String(result.stdout ?? '') + String(result.stderr ?? '')
    expect(result.status, output).toBe(0)
    expect(output).toContain('--stack에 유효한 기술 스택이 없습니다')
    expect(fs.readFileSync(path.join(dir, 'RULES.md'), 'utf-8')).toContain('후보, 첫 세션에서 확정')
  })
})
