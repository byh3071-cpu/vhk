import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const SCRIPT = path.join(process.cwd(), 'scripts', 'check-no-raw-json-parse.mjs')

/** 게이트 실행 → 종료코드. 0=PASS(금지 패턴 없음), 1=FAIL(발견). */
function runGate(scanRoot: string): number {
  try {
    execFileSync('node', [SCRIPT, scanRoot], { encoding: 'utf-8', stdio: 'pipe' })
    return 0
  } catch (e) {
    return (e as { status?: number }).status ?? -1
  }
}

/** scanRoot 으로 쓸 tmp 디렉터리에 src 파일 1개 작성 후 경로 반환. */
function fixture(name: string, content: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-jsonparse-'))
  fs.writeFileSync(path.join(d, name), content, 'utf-8')
  return d
}

describe('check-no-raw-json-parse 게이트', () => {
  it('raw JSON.parse(readFileSync(...)) → FAIL', () => {
    const d = fixture('bad.ts', "const x = JSON.parse(readFileSync('p', 'utf-8'))\n")
    expect(runGate(d)).toBe(1)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('raw JSON.parse(fs.readFileSync(...)) → FAIL (fs. 접두 포함)', () => {
    const d = fixture('bad.ts', "const x = JSON.parse(fs.readFileSync('p', 'utf-8'))\n")
    expect(runGate(d)).toBe(1)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('변수 경유 JSON.parse(stripBom(readFileSync(...))) → PASS (BOM-safe 우회)', () => {
    const d = fixture('ok.ts', "const x = JSON.parse(stripBom(readFileSync('p', 'utf-8')))\n")
    expect(runGate(d)).toBe(0)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('readJsonFile(...) → PASS (권장 형태)', () => {
    const d = fixture('ok.ts', "const x = readJsonFile('p')\n")
    expect(runGate(d)).toBe(0)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('하위 디렉터리도 재귀 스캔', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-jsonparse-'))
    fs.mkdirSync(path.join(d, 'sub'), { recursive: true })
    fs.writeFileSync(path.join(d, 'sub', 'bad.ts'), "JSON.parse(readFileSync('p'))\n", 'utf-8')
    expect(runGate(d)).toBe(1)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('실제 src/ 는 깨끗 → PASS (재발 회귀 가드)', () => {
    expect(runGate('src')).toBe(0)
  })
})
