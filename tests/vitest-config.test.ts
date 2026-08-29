import { describe, expect, it } from 'vitest'
import config from '../vitest.config.js'

describe('vitest 작업공간 경계', () => {
  it('VHK 로컬 상태와 중첩 릴리스 작업공간을 테스트 수집에서 제외한다', () => {
    const exclude = config.test?.exclude ?? []

    expect(exclude).toContain('**/.vhk/**')
  })

  it('Git e2e와 저장소 self-scan이 서로 굶지 않도록 worker 수를 제한한다', () => {
    expect(config.test?.maxWorkers).toBeTypeOf('number')
    expect(config.test?.maxWorkers as number).toBeGreaterThan(0)
    expect(config.test?.maxWorkers as number).toBeLessThanOrEqual(4)
  })
})
