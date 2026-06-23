import { describe, it, expect } from 'vitest'
import { program } from '../src/index.js'
import { TOP_LEVEL_COMMANDS } from '../src/lib/command-registry.js'
import { KNOWN_COMMAND_TOKENS, detectNaturalLanguageInput } from '../src/lib/cli-args.js'
import { routeNaturalLanguage } from '../src/lib/nlp-router.js'
import { ko } from '../src/i18n/ko.js'

// Goal 86 (RFC 0056 T1): vhk receipt 등록 4지점 + nlp-router + 한글별칭 드리프트 가드.
// 누락 시 첫 게이트(빌드/NL라우터)에서 깨진다(RFC 0055 §13-high#3 정면 예방).
describe('vhk receipt 등록 4지점 (Goal 86)', () => {
  it('① index.ts — commander 에 receipt 명령 등록 + 한글별칭 증거영수증', () => {
    const cmd = program.commands.find((c) => c.name() === 'receipt')
    expect(cmd, 'commander 에 receipt 명령 없음').toBeDefined()
    expect(cmd!.aliases(), 'receipt 에 한글별칭 증거영수증 없음').toContain('증거영수증')
  })

  it('② command-registry — TOP_LEVEL_COMMANDS 에 receipt(설명 포함)', () => {
    const entry = TOP_LEVEL_COMMANDS.find((c) => c.name === 'receipt')
    expect(entry, 'TOP_LEVEL_COMMANDS 에 receipt 없음').toBeDefined()
    expect(entry!.desc.length).toBeGreaterThan(0)
  })

  it('③ cli-args — KNOWN_COMMAND_TOKENS 에 receipt·증거영수증', () => {
    expect(KNOWN_COMMAND_TOKENS.has('receipt')).toBe(true)
    expect(KNOWN_COMMAND_TOKENS.has('증거영수증')).toBe(true)
  })

  it('④ ko.ts — receipt 메시지 네임스페이스 존재', () => {
    expect(ko.receipt, 'ko.receipt 네임스페이스 없음').toBeDefined()
    expect(typeof ko.receipt.title).toBe('string')
  })

  it('nlp-router — receipt 라우팅 + 증거영수증/영수증 키워드', () => {
    expect(routeNaturalLanguage('증거 영수증')?.command).toBe('receipt')
    expect(routeNaturalLanguage('영수증 만들어줘')?.command).toBe('receipt')
  })

  it('receipt / 증거영수증 단독 입력은 commander 로(자연어 가로채기 금지)', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', 'receipt'])).toBeNull()
    expect(detectNaturalLanguageInput(['node', 'vhk', '증거영수증'])).toBeNull()
  })

  it('기존 명령 시그니처 보존 — ship·mission·verify 모두 등록 유지(이름충돌 0)', () => {
    const names = program.commands.map((c) => c.name())
    for (const n of ['ship', 'mission', 'verify', 'review']) {
      expect(names, `${n} 명령이 사라짐(breaking)`).toContain(n)
    }
  })
})
