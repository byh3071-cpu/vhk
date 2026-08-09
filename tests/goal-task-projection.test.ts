import { describe, expect, it } from 'vitest'
import {
  parseGoalPhaseTasks,
  type GoalTaskProjectionInput,
  type WorkContextV1,
} from '../src/lib/goal-task-projection.js'

const DEFAULT_INPUT = {
  goalId: 134,
  goalTitle: 'Goal Phase Task 투영',
  goalStatus: 'IN_PROGRESS',
  sourceRef: '134-goal-phase-task.md',
} as const

function project(
  markdown: string,
  overrides: Partial<Omit<GoalTaskProjectionInput, 'markdown'>> = {},
): WorkContextV1 {
  return parseGoalPhaseTasks({ ...DEFAULT_INPUT, ...overrides, markdown })
}

function errorCodes(markdown: string): string[] {
  return project(markdown).errors.map((error) => error.code)
}

describe('Goal Phase Task 투영', () => {
  it('BOM·CRLF·한글·fence·결번을 보존하며 4 Phase 11 Task 그래프를 계산한다', () => {
    const markdown = '\uFEFF' + [
      '---',
      'type: goal',
      'id: 134',
      'title: Goal Phase Task 투영',
      'status: IN_PROGRESS',
      '---',
      '# Goal 134',
      '',
      '```markdown',
      '### Phase 1',
      '- [ ] **Task 1** backtick fence 안 예시',
      '```',
      '~~~markdown',
      '### Phase 2',
      '- [ ] **Task 2** tilde fence 안 예시',
      '~~~',
      '',
      '### Phase 10',
      '- [x] **Task 100** 한글 증거 / 증거: sample-korean',
      '- [ ] **Task 105** `(na)` 이번 범위 제외',
      '- [X] **Task 110** 대문자 완료',
      '',
      '### Phase 30',
      '- [ ] **Task 220** 영문 증거 / evidence: sample-english',
      '- [ ] **Task 225** 같은 Phase 병렬 작업',
      '- [x] **Task 230** 완료 작업',
      '',
      '### Phase 50',
      '- [ ] **Task 300** 앞 Phase 대기',
      '- [ ] **Task 305** `(na)`',
      '',
      '### Phase 90',
      '- [ ] **Task 400** 결번 Phase 작업',
      '- [X] **Task 410** terminal이어도 의존성 보존',
      '- [ ] **Task 420** 같은 Phase 두 번째 대기',
    ].join('\r\n')

    const result = project(markdown)

    expect(result).toEqual({
      schemaVersion: 1,
      valid: true,
      activeGoal: {
        id: 'goal:134',
        title: 'Goal Phase Task 투영',
        sourceStatus: 'IN_PROGRESS',
        phases: [
          { id: 'goal:134/phase:10' },
          { id: 'goal:134/phase:30' },
          { id: 'goal:134/phase:50' },
          { id: 'goal:134/phase:90' },
        ],
        tasks: [
          {
            id: 'goal:134/task:100',
            phaseId: 'goal:134/phase:10',
            sourceStatus: 'completed',
            readiness: 'terminal',
            dependsOn: [],
            evidenceHint: 'sample-korean',
            sourceRef: '134-goal-phase-task.md',
            sourceLine: 19,
          },
          {
            id: 'goal:134/task:105',
            phaseId: 'goal:134/phase:10',
            sourceStatus: 'notApplicable',
            readiness: 'terminal',
            dependsOn: [],
            evidenceHint: null,
            sourceRef: '134-goal-phase-task.md',
            sourceLine: 20,
          },
          {
            id: 'goal:134/task:110',
            phaseId: 'goal:134/phase:10',
            sourceStatus: 'completed',
            readiness: 'terminal',
            dependsOn: [],
            evidenceHint: null,
            sourceRef: '134-goal-phase-task.md',
            sourceLine: 21,
          },
          {
            id: 'goal:134/task:220',
            phaseId: 'goal:134/phase:30',
            sourceStatus: 'pending',
            readiness: 'ready',
            dependsOn: ['goal:134/task:100', 'goal:134/task:105', 'goal:134/task:110'],
            evidenceHint: 'sample-english',
            sourceRef: '134-goal-phase-task.md',
            sourceLine: 24,
          },
          {
            id: 'goal:134/task:225',
            phaseId: 'goal:134/phase:30',
            sourceStatus: 'pending',
            readiness: 'ready',
            dependsOn: ['goal:134/task:100', 'goal:134/task:105', 'goal:134/task:110'],
            evidenceHint: null,
            sourceRef: '134-goal-phase-task.md',
            sourceLine: 25,
          },
          {
            id: 'goal:134/task:230',
            phaseId: 'goal:134/phase:30',
            sourceStatus: 'completed',
            readiness: 'terminal',
            dependsOn: ['goal:134/task:100', 'goal:134/task:105', 'goal:134/task:110'],
            evidenceHint: null,
            sourceRef: '134-goal-phase-task.md',
            sourceLine: 26,
          },
          {
            id: 'goal:134/task:300',
            phaseId: 'goal:134/phase:50',
            sourceStatus: 'pending',
            readiness: 'waiting',
            dependsOn: ['goal:134/task:220', 'goal:134/task:225', 'goal:134/task:230'],
            evidenceHint: null,
            sourceRef: '134-goal-phase-task.md',
            sourceLine: 29,
          },
          {
            id: 'goal:134/task:305',
            phaseId: 'goal:134/phase:50',
            sourceStatus: 'notApplicable',
            readiness: 'terminal',
            dependsOn: ['goal:134/task:220', 'goal:134/task:225', 'goal:134/task:230'],
            evidenceHint: null,
            sourceRef: '134-goal-phase-task.md',
            sourceLine: 30,
          },
          {
            id: 'goal:134/task:400',
            phaseId: 'goal:134/phase:90',
            sourceStatus: 'pending',
            readiness: 'waiting',
            dependsOn: ['goal:134/task:300', 'goal:134/task:305'],
            evidenceHint: null,
            sourceRef: '134-goal-phase-task.md',
            sourceLine: 33,
          },
          {
            id: 'goal:134/task:410',
            phaseId: 'goal:134/phase:90',
            sourceStatus: 'completed',
            readiness: 'terminal',
            dependsOn: ['goal:134/task:300', 'goal:134/task:305'],
            evidenceHint: null,
            sourceRef: '134-goal-phase-task.md',
            sourceLine: 34,
          },
          {
            id: 'goal:134/task:420',
            phaseId: 'goal:134/phase:90',
            sourceStatus: 'pending',
            readiness: 'waiting',
            dependsOn: ['goal:134/task:300', 'goal:134/task:305'],
            evidenceHint: null,
            sourceRef: '134-goal-phase-task.md',
            sourceLine: 35,
          },
        ],
      },
      warnings: [],
      errors: [],
    })
  })

  it.each([
    {
      name: 'Phase 중복',
      markdown: '### Phase 1\n- [ ] **Task 1** 첫 작업\n### Phase 1\n- [ ] **Task 2** 두 번째 작업',
      code: 'DUPLICATE_PHASE_ID',
    },
    {
      name: 'Phase 역순',
      markdown: '### Phase 2\n- [ ] **Task 1** 첫 작업\n### Phase 1\n- [ ] **Task 2** 두 번째 작업',
      code: 'OUT_OF_ORDER_PHASE_ID',
    },
    {
      name: '빈 Phase',
      markdown: '### Phase 1\n### Phase 2\n- [ ] **Task 2** 작업',
      code: 'EMPTY_PHASE',
    },
    {
      name: 'Phase 밖 Task',
      markdown: '- [ ] **Task 1** 소속 없는 작업',
      code: 'TASK_WITHOUT_PHASE',
    },
    {
      name: 'Task 중복',
      markdown: '### Phase 1\n- [ ] **Task 2** 첫 작업\n- [ ] **Task 2** 두 번째 작업',
      code: 'DUPLICATE_TASK_ID',
    },
    {
      name: 'Task 역순',
      markdown: '### Phase 1\n- [ ] **Task 2** 첫 작업\n- [ ] **Task 1** 두 번째 작업',
      code: 'OUT_OF_ORDER_TASK_ID',
    },
    {
      name: '0인 Phase',
      markdown: '### Phase 0\n- [ ] **Task 1** 작업',
      code: 'INVALID_PHASE_ID',
    },
    {
      name: '0인 Task',
      markdown: '### Phase 1\n- [ ] **Task 0** 작업',
      code: 'INVALID_TASK_ID',
    },
    {
      name: '비정수 Phase',
      markdown: '### Phase 1.5\n- [ ] **Task 1** 작업',
      code: 'INVALID_PHASE_ID',
    },
    {
      name: '비정수 Task',
      markdown: '### Phase 1\n- [ ] **Task 1.5** 작업',
      code: 'INVALID_TASK_ID',
    },
  ])('$name을 안전한 구조 오류로 차단한다', ({ markdown, code }) => {
    const result = project(markdown)

    expect(result.valid).toBe(false)
    expect(result.activeGoal).toBeNull()
    expect(result.errors.map((error) => error.code)).toContain(code)
    expect(JSON.stringify(result)).not.toContain(markdown)
  })

  it.each(['1e2', '0x10', '+1', '01'])(
    'Phase ID %s를 ASCII canonical decimal positive integer로 보지 않는다',
    (phaseId) => {
      expect(errorCodes(`### Phase ${phaseId}\n- [ ] **Task 1** 작업`)).toContain(
        'INVALID_PHASE_ID',
      )
    },
  )

  it.each(['1e2', '0x10', '+1', '01'])(
    'Task ID %s를 ASCII canonical decimal positive integer로 보지 않는다',
    (taskId) => {
      expect(errorCodes(`### Phase 1\n- [ ] **Task ${taskId}** 작업`)).toContain(
        'INVALID_TASK_ID',
      )
    },
  )

  it.each([
    {
      markdown: '### **Phase 1**\n- [ ] **Task 1** 작업',
      code: 'INVALID_PHASE_SYNTAX',
    },
    {
      markdown: '### _Phase 1_\n- [ ] **Task 1** 작업',
      code: 'INVALID_PHASE_SYNTAX',
    },
    {
      markdown: '### `Phase 1`\n- [ ] **Task 1** 작업',
      code: 'INVALID_PHASE_SYNTAX',
    },
    {
      markdown: '### ***Phase 1***\n- [ ] **Task 1** 작업',
      code: 'INVALID_PHASE_SYNTAX',
    },
    {
      markdown: '### ___Phase 1___\n- [ ] **Task 1** 작업',
      code: 'INVALID_PHASE_SYNTAX',
    },
    {
      markdown: '### ```Phase 1```\n- [ ] **Task 1** 작업',
      code: 'INVALID_PHASE_SYNTAX',
    },
    {
      markdown: '### Phase 1\n- [ ] **1** Task label 없는 작업',
      code: 'INVALID_TASK_SYNTAX',
    },
    {
      markdown: '- [ ] *Task 1* 작업',
      code: 'INVALID_TASK_SYNTAX',
    },
    {
      markdown: '- [ ] ***Task 1*** 작업',
      code: 'INVALID_TASK_SYNTAX',
    },
    {
      markdown: '- [ ] `Task 1` 작업',
      code: 'INVALID_TASK_SYNTAX',
    },
    {
      markdown: '- [ ] Task 1 작업',
      code: 'INVALID_TASK_SYNTAX',
    },
  ])('Phase/Task 유사 문법을 legacy가 아닌 $code 구조 오류로 처리한다', ({ markdown, code }) => {
    const result = project(markdown)

    expect(result.valid).toBe(false)
    expect(result.errors.map((error) => error.code)).toContain(code)
    expect(JSON.stringify(result)).not.toContain(markdown)
  })

  it('Task 라벨 직후의 정확한 backticked `(na)`만 notApplicable로 읽는다', () => {
    const result = project([
      '### Phase 1',
      '- [ ] **Task 1** `(na)`',
      '- [ ] **Task 2** (na) 평문',
      '- [ ] **Task 3** 설명 `(na)`',
      '- [ ] **Task 4** `(NA)` 대소문자 불일치',
    ].join('\n'))

    expect(result.activeGoal?.tasks.map((task) => task.sourceStatus)).toEqual([
      'notApplicable',
      'pending',
      'pending',
      'pending',
    ])
  })

  it('checked Task와 정확한 `(na)` marker의 충돌을 차단한다', () => {
    expect(errorCodes('### Phase 1\n- [x] **Task 1** `(na)` 충돌')).toContain(
      'CHECKED_NOT_APPLICABLE_TASK',
    )
  })

  it('빈 evidence hint와 닫히지 않은 fence를 차단한다', () => {
    expect(errorCodes('### Phase 1\n- [ ] **Task 1** 작업 / evidence:   ')).toContain(
      'INVALID_EVIDENCE_HINT',
    )
    expect(errorCodes('```markdown\n### Phase 1\n- [ ] **Task 1** 숨겨진 작업')).toContain(
      'UNCLOSED_CODE_FENCE',
    )
  })

  it('Phase가 없는 legacy Goal은 빈 배열과 NO_PHASES warning으로 호환한다', () => {
    expect(project('# 기존 Goal\n\n자유 형식 본문')).toEqual({
      schemaVersion: 1,
      valid: true,
      activeGoal: {
        id: 'goal:134',
        title: 'Goal Phase Task 투영',
        sourceStatus: 'IN_PROGRESS',
        phases: [],
        tasks: [],
      },
      warnings: [{ code: 'NO_PHASES' }],
      errors: [],
    })
  })
})

  it('Phase 없는 legacy Goal의 일반 숫자 checklist는 구조 오류가 아니다', () => {
    const result = project('# 기존 Goal\n\n- [ ] 2026년 목표')

    expect(result.valid).toBe(true)
    expect(result.activeGoal?.phases).toEqual([])
    expect(result.activeGoal?.tasks).toEqual([])
    expect(result.warnings).toEqual([{ code: 'NO_PHASES' }])
    expect(result.errors).toEqual([])
  })

describe('Goal projection 공개 경계', () => {
  it('명백한 sample 값은 시크릿·홈 placeholder·이메일·영 UUID로 오인하지 않는다', () => {
    const zeroUuid = ['00000000', '0000', '0000', '0000', '000000000000'].join('-')
    const result = project('### Phase 1\n- [ ] **Task 1** sample-token', {
      goalTitle: `sample@example.com <HOME>/sample ${zeroUuid}`,
      sourceRef: 'nested/sample-goal.md',
    })

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it.each([
    {
      name: '시크릿',
      value: ['ghp_', 'a'.repeat(36)].join(''),
    },
    {
      name: '홈 절대경로',
      value: ['C:', 'Users', 'private-user', 'project'].join('\\'),
    },
    {
      name: '개인 이메일',
      value: ['private-user', 'gmail.com'].join('@'),
    },
    {
      name: '실제처럼 보이는 UUID',
      value: ['12345678', '1234', '1234', '1234', '123456789abc'].join('-'),
    },
  ])('$name은 원문 없이 전체 투영을 차단한다', ({ value }) => {
    const result = project('### Phase 1\n- [ ] **Task 1** 작업', { goalTitle: value })

    expect(result).toEqual({
      schemaVersion: 1,
      valid: false,
      activeGoal: null,
      warnings: [],
      errors: [{ code: 'PUBLIC_BOUNDARY_VIOLATION' }],
    })
    expect(JSON.stringify(result)).not.toContain(value)
  })

  it('앞의 sample 시크릿이 뒤의 실제 시크릿 검사를 가리지 못한다', () => {
    const placeholder = ['ghp_', 'x'.repeat(36)].join('')
    const secret = ['ghp_', 'a'.repeat(36)].join('')
    const result = project('### Phase 1\n- [ ] **Task 1** 작업', {
      goalTitle: `${placeholder} ${secret}`,
    })

    expect(result.errors).toEqual([{ code: 'PUBLIC_BOUNDARY_VIOLATION' }])
  })

  it('전체가 명백한 placeholder인 GitHub token은 허용한다', () => {
    const placeholder = ['ghp_', 'x'.repeat(36)].join('')
    const result = project('### Phase 1\n- [ ] **Task 1** 작업', { goalTitle: placeholder })

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it.each([
    {
      name: 'AWS access key',
      value: `AKIA${'X'.repeat(16)}`,
    },
    {
      name: 'Authorization bearer token',
      value: `Authorization: Bearer ${'x'.repeat(12)}`,
    },
  ])('$name의 전체 placeholder 값은 허용한다', ({ value }) => {
    const result = project('### Phase 1\n- [ ] **Task 1** 작업', { goalTitle: value })

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it.each([
    {
      name: 'title without a dot in the domain',
      goalTitle: 'private-user@company',
      markdown: '# Goal',
      unsafeValue: 'private-user@company',
    },
    {
      name: 'evidence with a bracketed IPv4 address',
      goalTitle: 'safe title',
      markdown: '### Phase 1\n- [ ] **Task 1** 작업 / evidence: private-user@[192.0.2.1]',
      unsafeValue: 'private-user@[192.0.2.1]',
    },
    {
      name: 'evidence with a bracketed IPv6 address',
      goalTitle: 'safe title',
      markdown: '### Phase 1\n- [ ] **Task 1** 작업 / evidence: private-user@[IPv6:2001:db8::1]',
      unsafeValue: 'private-user@[IPv6:2001:db8::1]',
    },
    {
      name: 'Unicode title email',
      goalTitle: '사용자@예시.한국',
      markdown: '# Goal',
      unsafeValue: '사용자@예시.한국',
    },
  ])('$name is rejected without preserving the email', ({ goalTitle, markdown, unsafeValue }) => {
    const result = project(markdown, { goalTitle })

    expect(result.errors).toEqual([{ code: 'PUBLIC_BOUNDARY_VIOLATION' }])
    expect(JSON.stringify(result)).not.toContain(unsafeValue)
  })

  it.each(['react@19', 'package@latest', 'library@1.2.3'])(
    'package version/tag %s is not treated as a private email',
    (value) => {
      const result = project('# Goal', { goalTitle: value })

      expect(result.valid).toBe(true)
      expect(result.warnings).toEqual([{ code: 'NO_PHASES' }])
      expect(result.errors).toEqual([])
    },
  )

  it('명백한 fake JWT placeholder는 허용한다', () => {
    const result = project('### Phase 1\n- [ ] **Task 1** 작업', {
      goalTitle: 'eyJxxxx.eyJxxxx.xxxx',
    })

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('sample/example/fake JWT placeholder는 허용한다', () => {
    const result = project('### Phase 1\n- [ ] **Task 1** 작업', {
      goalTitle: 'eyJsample.eyJexample.fake',
    })

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('실제 JWT payload 뒤 fake suffix는 허용하지 않는다', () => {
    const token = `eyJ${'a'.repeat(12)}.eyJ${'b'.repeat(12)}.${'c'.repeat(12)}-fake`
    const result = project('### Phase 1\n- [ ] **Task 1** 작업', { goalTitle: token })

    expect(result.errors).toEqual([{ code: 'PUBLIC_BOUNDARY_VIOLATION' }])
    expect(JSON.stringify(result)).not.toContain(token)
  })

  it.each(['sample', 'fake', 'redacted', 'xxxx'])(
    'GitHub token payload의 %s 부분 문자열을 placeholder로 면제하지 않는다',
    (placeholder) => {
      const token = ['ghp_', 'a'.repeat(18), placeholder, 'b'.repeat(18)].join('')
      const result = project('### Phase 1\n- [ ] **Task 1** 작업', { goalTitle: token })

      expect(result.errors).toEqual([{ code: 'PUBLIC_BOUNDARY_VIOLATION' }])
      expect(JSON.stringify(result)).not.toContain(token)
    },
  )

  it.each([
    {
      name: 'OpenAI project token',
      token: `sk-proj-${'a'.repeat(20)}-fake`,
    },
    {
      name: 'GitHub fine-grained token',
      token: `github_pat_${'A'.repeat(36)}_xxxx`,
    },
    {
      name: 'Slack bot token',
      token: `xoxb-${'A'.repeat(12)}-fake`,
    },
  ])('$name의 실제 payload 뒤 placeholder suffix를 허용하지 않는다', ({ token }) => {
    const result = project('### Phase 1\n- [ ] **Task 1** 작업', { goalTitle: token })

    expect(result.errors).toEqual([{ code: 'PUBLIC_BOUNDARY_VIOLATION' }])
    expect(JSON.stringify(result)).not.toContain(token)
  })

  it.each([
    ['C:', 'Users', 'private user', 'project'].join('\\'),
    ['', 'home', 'private user', 'project'].join('/'),
    ['', 'Users', 'private user', 'project'].join('/'),
    String.raw`\\server\Users\private-user\repo`,
    String.raw`\\server\C$\Users\private-user\repo`,
    String.raw`\\server\share\profiles\Users\private-user\repo`,
    String.raw`\\?\UNC\server\C$\Users\private-user\repo`,
    String.raw`\\?\UNC\server\share\profiles\Users\private-user\repo`,
  ])('공백이 있는 home 경로를 원문 없이 차단한다', (homePath) => {
    const result = project('### Phase 1\n- [ ] **Task 1** 작업', { goalTitle: homePath })

    expect(result.errors).toEqual([{ code: 'PUBLIC_BOUNDARY_VIOLATION' }])
    expect(JSON.stringify(result)).not.toContain(homePath)
  })

  it.each(['prefix_', '_suffix'])('underscore에 붙은 non-zero UUID %s를 차단한다', (affix) => {
    const uuid = ['12345678', '1234', '1234', '1234', '123456789abc'].join('-')
    const value = affix.startsWith('_') ? `${uuid}${affix}` : `${affix}${uuid}`
    const result = project('### Phase 1\n- [ ] **Task 1** 작업', { goalTitle: value })

    expect(result.errors).toEqual([{ code: 'PUBLIC_BOUNDARY_VIOLATION' }])
    expect(JSON.stringify(result)).not.toContain(value)
  })

  it.each([
    'C:/absolute/sample-goal.md',
    '../sample-goal.md',
    '.vhk/sample-goal.md',
    '.VHK/sample-goal.md',
    'goals/sample-goal.md',
    'Goals/sample-goal.md',
    'docs/state/next-task.md',
    'docs/state/archive/sample-goal.md',
    'DOCS/STATE/next-task.md',
    'nested\\sample-goal.md',
  ])('안전한 POSIX 상대 참조가 아닌 sourceRef %s를 차단한다', (sourceRef) => {
    const result = project('### Phase 1\n- [ ] **Task 1** 작업', { sourceRef })

    expect(result.valid).toBe(false)
    expect(result.activeGoal).toBeNull()
    expect(result.errors).toEqual([{ code: 'PUBLIC_BOUNDARY_VIOLATION' }])
  })
})
