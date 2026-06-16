import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { scanLlmGuardrails } from '../src/lib/scan-llm-guardrails.js'

let dir: string

function write(name: string, content: string): void {
  fs.writeFileSync(path.join(dir, name), content)
}
function pats(file?: string): string[] {
  const scan = scanLlmGuardrails(dir)
  return scan.findings.filter((f) => !file || f.file === file).map((f) => f.pat)
}

describe('scanLlmGuardrails (PAT-001/002/004 휴리스틱)', () => {
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-llmguard-'))
  })
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('PAT-001: LLM 값이 select 로 흘러가는데 allowlist 없음 → 검출', () => {
    write('pat001.ts', `import { anthropic } from 'x'\nconst v = await callLLM()\nobj.select = v\n`)
    expect(pats('pat001.ts')).toContain('PAT-001')
  })

  it('PAT-001 안전: 인접 allowlist 가드 있으면 미검출 (false-positive 봉쇄)', () => {
    write('safe001.ts', `import { anthropic } from 'x'\nconst ALLOWED_VALUES = ['a','b']\nconst v = await callLLM()\nobj.select = ALLOWED_VALUES.includes(v) ? v : 'a'\n`)
    expect(pats('safe001.ts')).not.toContain('PAT-001')
  })

  it('PAT-002: LLM 응답 직접 JSON.parse(raw) + 추출 가드 없음 → 검출', () => {
    write('pat002.ts', `import { anthropic } from 'x'\nconst raw = await llm()\nconst data = JSON.parse(raw)\n`)
    expect(pats('pat002.ts')).toContain('PAT-002')
  })

  it('PAT-002 안전: 인접 추출기(extractJson) 있으면 미검출', () => {
    write('safe002.ts', `import { anthropic } from 'x'\nconst raw = await llm()\nconst fenced = extractJson(raw)\nconst data = JSON.parse(raw)\n`)
    expect(pats('safe002.ts')).not.toContain('PAT-002')
  })

  it('PAT-002 우회 회귀(#10): 추출기가 멀리(>윈도우) 있으면 가드로 인정 안 됨 → 여전히 검출', () => {
    const filler = Array.from({ length: 35 }, (_, i) => `// filler ${i}`).join('\n')
    write('bypass002.ts', `import { anthropic } from 'x'\nconst raw = await llm()\nconst data = JSON.parse(raw)\n${filler}\nfunction unrelated() { return extractJson('x') }\n`)
    expect(pats('bypass002.ts')).toContain('PAT-002')
  })

  it('PAT-004: 노출 진입점(POST) + LLM 호출 + 입력 클램프 없음 → 검출', () => {
    write('route.ts', `export async function POST(req) {\n  const r = await client.messages.create({ model: 'claude-3' })\n  return r\n}\n`)
    expect(pats('route.ts')).toContain('PAT-004')
  })

  it('비-LLM 파일은 스킵 (false-positive 0)', () => {
    write('pure.ts', `const x = 1\nexport function add(a: number, b: number) { return a + b }\n`)
    expect(pats('pure.ts')).toHaveLength(0)
  })
})
