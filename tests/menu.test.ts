import { describe, it, expect } from 'vitest'
import { printNextStep } from '../src/lib/next-step.js'

describe('next-step 유틸', () => {
  it('printNextStep가 에러 없이 실행된다', () => {
    expect(() => printNextStep({
      message: '테스트 메시지',
      command: 'vhk 시작',
    })).not.toThrow()
  })

  it('cursorHint 포함 시 에러 없이 실행된다', () => {
    expect(() => printNextStep({
      message: '테스트',
      command: 'vhk 점검',
      cursorHint: '점검해줘',
      alternative: '수동으로 해도 됩니다',
    })).not.toThrow()
  })
})
