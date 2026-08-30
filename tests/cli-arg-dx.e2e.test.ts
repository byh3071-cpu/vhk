import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { readJsonFile } from '../src/lib/read-json.js'
import { removeDirSync } from '../src/lib/fs-remove.js'

// 실제 빌드된 CLI 를 spawn 해서 commander 인자 파싱을 검증한다(#148/#151 은 파싱 레이어 결함이라
// 함수 단위 mock 으론 재현 불가 — dist 필요).
const bin = path.join(process.cwd(), 'dist', 'index.js')
function runCli(args: string[], cwd: string) {
  return spawnSync(process.execPath, [bin, ...args], {
    encoding: 'utf-8',
    cwd,
    env: { ...process.env, CI: '1' },
  })
}

describe('ref add --title 별칭 (#151)', () => {
  it('--title 은 --memo 별칭으로 저장된다 (unknown option 없음)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-ref-title-'))
    try {
      const r = runCli(['ref', 'add', 'https://ex.com', '--title', '제목메모'], tmp)
      expect(String(r.stderr ?? '')).not.toMatch(/unknown option/i)
      const refs = readJsonFile<Array<{ url: string; memo: string }>>(
        path.join(tmp, '.vhk', 'refs.json'),
      )
      expect(refs[0].url).toBe('https://ex.com')
      expect(refs[0].memo).toBe('제목메모')
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('--memo 도 그대로 동작 (회귀)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-ref-memo-'))
    try {
      runCli(['ref', 'add', 'https://ex.com', '--memo', '메모값'], tmp)
      const refs = readJsonFile<Array<{ memo: string }>>(path.join(tmp, '.vhk', 'refs.json'))
      expect(refs[0].memo).toBe('메모값')
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('memory add 한글 별칭 추가 (#613)', () => {
  it('vhk 기억 추가 "본문" --type decision 이 저장되고 unknown option 이 없다', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-mem-ko-add-'))
    try {
      const r = runCli(['기억', '추가', '한글별칭 결정', '--type', 'decision'], tmp)
      expect(String(r.stderr ?? '')).not.toMatch(/unknown option/i)
      expect(r.status).toBe(0)
      expect(String(r.stdout ?? '')).toMatch(/기억 저장됨/)
      const raw = fs.readFileSync(path.join(tmp, '.vhk', 'memory.json'), 'utf-8')
      expect(raw).toContain('한글별칭 결정')
    } finally {
      removeDirSync(tmp)
    }
  })

  it('vhk memory 추가 "본문" --type success 도 동일 (영문 컨테이너 + 한글 서브)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-mem-ko-sub-'))
    try {
      const r = runCli(['memory', '추가', '한글서브 성공', '--type', 'success'], tmp)
      expect(String(r.stderr ?? '')).not.toMatch(/unknown option/i)
      expect(r.status).toBe(0)
      expect(String(r.stdout ?? '')).toMatch(/기억 저장됨/)
    } finally {
      removeDirSync(tmp)
    }
  })

  it('무효 서브 + 옵션은 unknown option 대신 친절 가드 (exit 1)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-mem-bad-sub-'))
    try {
      const r = runCli(['memory', '없는서브', '--type', 'decision'], tmp)
      const err = `${r.stdout ?? ''}\n${r.stderr ?? ''}`
      expect(err).not.toMatch(/unknown option/i)
      expect(err).toMatch(/서브커맨드가 아니에요/)
      expect(r.status).not.toBe(0)
    } finally {
      removeDirSync(tmp)
    }
  })
})

describe('memory add --content — 대시(--) 시작 본문 (#148)', () => {
  it('--content= 로 -- 시작 본문 저장 (unknown option/too many arguments 없음)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-mem-content-'))
    try {
      const r = runCli(['memory', 'add', '--content=--on-accent CSS 변수', '--type', 'decision'], tmp)
      expect(String(r.stderr ?? '')).not.toMatch(/unknown option|too many arguments/i)
      expect(String(r.stdout ?? '')).toMatch(/기억 저장됨/)
      const raw = fs.readFileSync(path.join(tmp, '.vhk', 'memory.json'), 'utf-8')
      expect(raw).toContain('--on-accent')
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('일반 positional 본문도 그대로 동작 (회귀)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-mem-pos-'))
    try {
      const r = runCli(['memory', 'add', '보통 결정 내용', '--type', 'decision'], tmp)
      expect(String(r.stdout ?? '')).toMatch(/기억 저장됨/)
      const raw = fs.readFileSync(path.join(tmp, '.vhk', 'memory.json'), 'utf-8')
      expect(raw).toContain('보통 결정 내용')
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})
