import { describe, it, expect, afterEach } from 'vitest'
import { log, setQuiet, isQuiet, setSink } from '../src/utils/logger.js'

describe('logger 출력 SoT', () => {
  afterEach(() => {
    setQuiet(false)
  })

  it('setSink 가 모든 출력을 단일 지점에서 캡처한다', () => {
    const lines: string[] = []
    const restore = setSink((l) => lines.push(l))
    log.info('hi')
    log.success('done')
    restore()
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('hi')
    expect(lines[1]).toContain('done')
  })

  it('setQuiet(true) 면 일반 출력을 한 지점에서 끈다', () => {
    const lines: string[] = []
    const restore = setSink((l) => lines.push(l))
    setQuiet(true)
    log.info('silent')
    log.success('silent2')
    log.plain('silent3')
    restore()
    expect(lines).toHaveLength(0)
    expect(isQuiet()).toBe(true)
  })

  it('quiet 여도 error 는 노출(실패 은폐 금지)', () => {
    const lines: string[] = []
    const restore = setSink((l) => lines.push(l))
    setQuiet(true)
    log.error('boom')
    restore()
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('boom')
  })

  it('확장 렌더 프린터 4종(plain/dim/bold/list)', () => {
    const lines: string[] = []
    const restore = setSink((l) => lines.push(l))
    log.plain('p')
    log.dim('d')
    log.bold('b')
    log.list('item')
    restore()
    expect(lines).toHaveLength(4)
    expect(lines[0]).toContain('p')
    expect(lines[1]).toContain('d')
    expect(lines[2]).toContain('b')
    expect(lines[3]).toContain('item')
    expect(lines[3]).toContain('•')
  })

  it('setSink 는 복원 함수를 반환해 이전 sink 로 되돌린다', () => {
    const a: string[] = []
    const b: string[] = []
    const restoreA = setSink((l) => a.push(l))
    const restoreB = setSink((l) => b.push(l))
    log.plain('to-b')
    restoreB()
    log.plain('to-a')
    restoreA()
    expect(a).toEqual(['to-a'])
    expect(b).toEqual(['to-b'])
  })
})
