import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  generateIndexNowKey,
  isValidIndexNowKey,
  indexNowKeyFileName,
  buildIndexNowPayload,
  ensureIndexNowKey,
  readIndexNowKey,
  GOOGLE_INDEXING_API_FORBIDDEN,
  INDEXNOW_KEY_REL,
} from '../src/commands/seo/submit.js'

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-seosubmit-'))
}

describe('Goal 22: IndexNow 순수 로직', () => {
  it('generateIndexNowKey → 32 hex, 형식 유효', () => {
    const k = generateIndexNowKey()
    expect(k).toMatch(/^[a-f0-9]{32}$/)
    expect(isValidIndexNowKey(k)).toBe(true)
  })

  it('isValidIndexNowKey 경계(8~128, hex만)', () => {
    expect(isValidIndexNowKey('abc1234')).toBe(false) // 7자
    expect(isValidIndexNowKey('abcd1234')).toBe(true) // 8자
    expect(isValidIndexNowKey('xyz!')).toBe(false)
  })

  it('indexNowKeyFileName = `${key}.txt`', () => {
    expect(indexNowKeyFileName('deadbeef')).toBe('deadbeef.txt')
  })

  it('buildIndexNowPayload 규격(host/key/keyLocation/urlList)', () => {
    const p = buildIndexNowPayload('example.com', 'abc123', ['https://example.com/a'])
    expect(p).toEqual({
      host: 'example.com',
      key: 'abc123',
      keyLocation: 'https://example.com/abc123.txt',
      urlList: ['https://example.com/a'],
    })
  })

  it('ensureIndexNowKey 멱등 — 재호출 시 동일 키 보존', () => {
    const d = tmp()
    const k1 = ensureIndexNowKey(d)
    const k2 = ensureIndexNowKey(d)
    expect(k1).toBe(k2)
    expect(readIndexNowKey(d)).toBe(k1)
    expect(fs.existsSync(path.join(d, INDEXNOW_KEY_REL))).toBe(true)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('구글 Indexing API 금지 가드(상수) + 소스에 indexing.googleapis 미사용', () => {
    expect(GOOGLE_INDEXING_API_FORBIDDEN).toBe(true)
    const src = fs.readFileSync('src/commands/seo/submit.ts', 'utf-8')
    // 주석 외 실제 호출 0 — fetch/axios 로 indexing.googleapis.com 을 부르지 않는다.
    expect(/(fetch|axios|https?\.request)[^\n]*indexing\.googleapis\.com/.test(src)).toBe(false)
  })
})
