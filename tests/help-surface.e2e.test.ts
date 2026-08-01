import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const bin = path.join(process.cwd(), 'dist', 'index.js')
const HIDDEN = ['content', 'launch', 'ops', 'sell', 'seo', 'cost', 'design-palette', 'theme']

function run(args: string[]) {
  return spawnSync(process.execPath, [bin, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, CI: '1' },
  })
}

function hasCommandLine(output: string, command: string): boolean {
  return output.split(/\r?\n/).some((line) => line.startsWith(`  ${command} `) || line.startsWith(`  ${command} (`))
}

describe('실제 CLI 도움말 표면', () => {
  it('vhk --help와 vhk help는 같은 기본 명령 표면이다', () => {
    for (const args of [['--help'], ['help']]) {
      const result = run(args)
      const output = String(result.stdout ?? '') + String(result.stderr ?? '')
      expect(result.status, `${args.join(' ')}: ${output}`).toBe(0)
      expect(output).toContain('기본 명령:')
      expect(output).toContain('vhk help --all')
      for (const command of HIDDEN) expect(hasCommandLine(output, command), command).toBe(false)
    }
  })

  it('vhk help --all은 숨긴 8종을 모두 표시한다', () => {
    const result = run(['help', '--all'])
    const output = String(result.stdout ?? '') + String(result.stderr ?? '')
    expect(result.status, output).toBe(0)
    expect(output).toContain('전체 명령:')
    for (const command of HIDDEN) expect(hasCommandLine(output, command), command).toBe(true)
  })
})
