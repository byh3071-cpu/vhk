import { describe, expect, it } from 'vitest'
import { META_TEMPLATE } from '../src/commands/goal.js'

describe('goal _meta template', () => {
  it('Goal Phase/Task 읽기 계약을 안내한다', () => {
    expect(META_TEMPLATE).toContain('### Phase 10')
    expect(META_TEMPLATE).toContain('- [ ] **Task 100** 작업 설명 / 증거: sample-evidence')
    expect(META_TEMPLATE).toContain('- [ ] **Task 105** `(na)` 제외 이유')
    expect(META_TEMPLATE).toContain('완료 checkbox와 함께 쓰면 구조 오류')
    expect(META_TEMPLATE).toContain('`/ 증거:`와 `/ evidence:`')
    expect(META_TEMPLATE).toContain('자동 병렬 실행을 보장하지 않는다')
    expect(META_TEMPLATE).toContain('직전 Phase의 모든 `goal:N/task:N` string ID')
    expect(META_TEMPLATE).toContain('`ready`, `waiting`, `terminal`')
    expect(META_TEMPLATE).toContain('성공·실패 모두 파일을 쓰지 않는다')
    expect(META_TEMPLATE).toContain('원문·절대경로·stack 없이')
    expect(META_TEMPLATE).toContain('Phase가 없는 legacy Goal도 `valid: true`')
    expect(META_TEMPLATE).toContain('`phases: []`와 `tasks: []`')
    expect(META_TEMPLATE).toContain('warning 코드 `NO_PHASES`')
    expect(META_TEMPLATE).toContain('exit 0으로 끝난다')
    expect(META_TEMPLATE).toContain('malformed Phase와 Phase 밖 Task는 구조 오류')
    expect(META_TEMPLATE).toContain('시크릿·토큰·키, 홈 절대경로, 개인 이메일·실명·저장소명, 실제 외부 객체 ID')
    expect(META_TEMPLATE).toContain('`--compact --json` 충돌은 `valid: false`와 exit 1')
  })
})
