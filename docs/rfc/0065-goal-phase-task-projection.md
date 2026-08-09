---
rfc: 0065
title: Read-only Goal Phase Task projection
status: Accepted
created: 2026-08-09
updated: 2026-08-09
supersedes: RFC-0064
relates: ADR-017, ADR-012, ADR-010
---

# RFC 0065 — Goal Phase Task 읽기 전용 투영

> 상태: **Accepted.** RFC 0064를 대체한다.
>
> 이 문서는 Goal Markdown 안의 Phase/Task를 읽어 `WorkContextV1`으로 출력하는 최소 계약만 다룬다.

## 0. 요약

Goal은 그대로 둔다. 본문의 아래 문법만 읽는다.

```markdown
### Phase 10
- [ ] **Task 100** 첫 작업 / 증거: sample-evidence
- [ ] **Task 105** `(na)` 이번 범위에서 제외
```

번호는 양수·고유·오름차순이면 되고 결번을 허용한다. 첫 Phase의 pending Task는 ready다. 이후
Phase의 pending Task는 직전 Phase의 모든 Task가 terminal일 때만 ready다. 결과는
`vhk context --json`의 읽기 전용 JSON이며 어떤 파일도 바꾸지 않는다.

## 1. 목표와 비목표

### 목표

- 기존 Goal Markdown의 Phase/Task ID와 source status를 결정론적으로 읽는다.
- 직전 Phase Task 전체를 `dependsOn`으로 투영하고 Task readiness를 계산한다.
- 한국어·영어 evidence hint 문법을 같은 필드로 읽는다.
- Phase가 없는 Goal과 기존 사람용 context·Goal·MCP 계약을 호환한다.
- 구조 오류와 공개 경계 위반에서도 원문이 없는 안전한 JSON을 반환한다.
- BOM·LF·CRLF와 실행 위치가 달라도 같은 의미의 `WorkContextV1`을 만든다.

### 비목표

- Goal, Phase 또는 Task 상태 쓰기
- Task 전용 파일·DB·원격 상태 저장소
- Goal Markdown의 명시적 Task 간 의존성 문법, 우선순위, 병렬 수와 자동 스케줄링
- evidence hint의 존재 확인, 검증 실행 또는 완료 증명
- 신규 MCP 도구와 기존 MCP API 변경
- 기존 사람용 context 출력, Goal 선택 순서와 Goal 완료 판정 변경
- 배포, 버전 변경과 소비자 저장소 수정

## 2. 입력과 정규화

| 정보 | 원본 | 이 RFC의 사용 |
|---|---|---|
| 제품 작업 정의·순서 | roadmap | 읽지 않음 |
| 제품 수용 기준 | PRD | 읽지 않음 |
| Goal 메타데이터·상태 | Goal frontmatter | 선택된 Goal의 id·title·status 읽기 |
| Phase/Task 구조·Task 상태 | Goal body | 읽기 |
| context·next-task·blocker | 로컬 상태 파일 | 읽지 않음 |

roadmap·PRD는 계속 제품 계약의 원본이다. Goal body의 Phase/Task는 그 Goal을 실행 가능한 크기로 나눈
로컬 구조일 뿐, roadmap·PRD 수용 기준의 대체 원본이나 cache가 아니다.

`vhk context --json`은 기존 Goal 목록과 기존 선택 순서를 재사용해 활성 Goal 하나를 고른다. 입력은
다음 순서로 정규화한다.

1. 파일 시작의 UTF-8 BOM 하나를 제거한다. 다른 위치의 문자는 건드리지 않는다.
2. CRLF와 LF를 같은 줄 경계로 읽는다. 출력 의미와 `sourceLine`은 줄바꿈 형식에 영향받지 않는다.
3. fenced code block을 먼저 제외한 뒤 Phase와 Task 문법을 찾는다.
4. 원문 줄 번호는 1부터 센다. 시작 BOM은 별도 줄을 만들지 않는다.

## 3. Markdown 문법

### 3.1 Phase

코드 펜스 밖에서 다음 한 줄만 Phase heading이다.

```text
### Phase <positive-integer>
```

- `###` 앞에는 공백을 허용하지 않는다.
- `Phase`의 대소문자와 공백은 정확히 유지한다.
- ID 뒤의 제목이나 다른 토큰은 허용하지 않는다.
- ID는 양수여야 하고 Goal 안에서 고유해야 하며 문서 순서대로 증가해야 한다.
- ID 결번은 허용한다. `Phase 10` 다음 `Phase 30`은 유효하다.
- 0·음수·비정수, 중복과 앞 ID보다 작은 ID는 구조 오류다.
- 각 Phase에는 Task가 하나 이상 있어야 한다.

### 3.2 Task

Phase heading 아래에서 다음 한 줄만 Task다.

```text
- [ ] **Task <positive-integer>** <description>
- [x] **Task <positive-integer>** <description>
- [ ] **Task <positive-integer>** `(na)` [description]
```

- 완료 checkbox는 소문자 `x`와 대문자 `X`를 허용한다.
- Task ID는 양수여야 하고 Goal 전체에서 고유해야 하며 문서 순서대로 증가해야 한다.
- ID 결번은 허용한다. Phase가 바뀌어도 이전 Task보다 큰 ID면 유효하다.
- Task는 가장 가까운 앞의 Phase에 속한다. Phase 앞의 Task는 구조 오류다.
- pending·completed Task의 설명은 trim 뒤 비어 있으면 안 된다. not-applicable Task는 marker 뒤 설명을
  생략할 수 있다.
- Task 라벨 `**Task N**` 직후 첫 토큰이 정확히 backticked `` `(na)` ``일 때만 not-applicable
  marker다. 괄호 없는 변형, 대소문자 변형, 평문 표기와 문장 중간의 `` `(na)` ``는 marker가
  아니다.
- 완료 checkbox와 not-applicable marker를 함께 쓰면 상태가 충돌하므로 구조 오류다.

### 3.3 source status

| checkbox와 marker | `sourceStatus` |
|---|---|
| `[ ]`, marker 없음 | `pending` |
| `[x]` 또는 `[X]`, marker 없음 | `completed` |
| `[ ]`, 라벨 직후 `` `(na)` `` | `notApplicable` |
| `[x]` 또는 `[X]`, 라벨 직후 `` `(na)` `` | 구조 오류 |

Phase 요약 표의 상태, description의 단어와 evidence hint는 source status에 영향을 주지 않는다.

### 3.4 evidence hint

description에서 먼저 나타난 정확한 구분자 중 하나 뒤의 문자열을 `evidenceHint`로 읽는다.

```text
 / 증거: <hint>
 / evidence: <hint>
```

- 구분자가 없으면 `evidenceHint`는 `null`이다.
- 구분자 뒤가 trim 후 비면 구조 오류다.
- 두 구분자가 모두 있으면 먼저 나타난 구분자가 시작점이고 나머지는 hint 문자열의 일부다.
- evidence hint는 사람이 다음 검증 위치를 찾는 힌트다. 파일 존재, 명령 성공과 Task 완료를 뜻하지
  않는다.

### 3.5 코드 펜스

CommonMark 방식의 backtick 또는 tilde fenced code block 안의 Phase/Task 모양은 전부 무시한다.
opening fence와 같은 문자이고 길이가 같거나 긴 closing fence만 닫힘으로 인정한다. 닫히지 않은
fence는 뒤의 실제 구조를 조용히 버리지 않도록 구조 오류로 처리한다.

## 4. 읽기 전용 작업 그래프

### 4.1 Phase와 Task ID

`activeGoal.id`는 `goal:N` string이다. `activeGoal.phases`는 문서 순서의 Phase 배열이고 각 원소의
`id`는 `goal:N/phase:N` string이다. `activeGoal.tasks`는 문서 순서의 평탄한 Task 배열이다. Task
`id`는 `goal:N/task:N`, `phaseId`는 소속 Phase의 string `id`다. 각 N 자리에는 해당 Goal·Phase·Task
번호를 넣는다.

번호 규칙은 연속성이 아니라 아래 세 조건의 결합이다.

```text
positive AND unique AND strictly ascending
```

Phase와 Task는 서로 다른 ID 공간을 사용한다. `Phase 10`과 `Task 10`이 함께 있어도 충돌이 아니다.

### 4.2 terminal과 readiness

`completed`와 `notApplicable`은 terminal source status다.

| Task 조건 | `readiness` |
|---|---|
| `sourceStatus`가 `completed` 또는 `notApplicable` | `terminal` |
| 첫 Phase의 `pending` Task | `ready` |
| 이후 Phase의 `pending` Task + 직전 Phase Task 전부 terminal | `ready` |
| 이후 Phase의 `pending` Task + 직전 Phase에 pending 존재 | `waiting` |

여기서 직전 Phase는 ID N-1이 아니라 문서에서 바로 앞에 나온 Phase다. 결번이 있어도 같은 규칙을
쓴다.

### 4.3 dependsOn

- 첫 Phase의 모든 Task는 `dependsOn: []`다.
- 같은 Phase의 Task끼리는 서로 의존하지 않으므로 같은 Phase에서 유래한 ID를 넣지 않는다.
- 두 번째 이후 Phase의 각 Task는 직전 Phase의 모든 string Task ID를 문서 순서대로 `dependsOn`에
  담는다.
- 현재 Task가 terminal이어도 그래프 구조를 보존하기 위해 `dependsOn`은 같은 방식으로 만든다.

따라서 같은 Phase의 Task는 동시에 ready일 수 있고, 다음 Phase는 직전 Phase의 모든 Task가
terminal일 때 함께 열린다. 이 배열은 Goal 원본에 새 의존성 문법을 쓰지 않는 읽기 전용 Phase
장벽이다.

## 5. WorkContextV1

### 5.1 정상 예시

```json
{
  "schemaVersion": 1,
  "valid": true,
  "activeGoal": {
    "id": "goal:1",
    "title": "샘플 Goal",
    "sourceStatus": "IN_PROGRESS",
    "phases": [
      {
        "id": "goal:1/phase:10"
      },
      {
        "id": "goal:1/phase:30"
      },
      {
        "id": "goal:1/phase:50"
      }
    ],
    "tasks": [
      {
        "id": "goal:1/task:100",
        "phaseId": "goal:1/phase:10",
        "sourceStatus": "completed",
        "readiness": "terminal",
        "dependsOn": [],
        "evidenceHint": "sample-evidence",
        "sourceRef": "sample-goal.md",
        "sourceLine": 12
      },
      {
        "id": "goal:1/task:105",
        "phaseId": "goal:1/phase:10",
        "sourceStatus": "notApplicable",
        "readiness": "terminal",
        "dependsOn": [],
        "evidenceHint": null,
        "sourceRef": "sample-goal.md",
        "sourceLine": 13
      },
      {
        "id": "goal:1/task:220",
        "phaseId": "goal:1/phase:30",
        "sourceStatus": "pending",
        "readiness": "ready",
        "dependsOn": [
          "goal:1/task:100",
          "goal:1/task:105"
        ],
        "evidenceHint": "sample-report",
        "sourceRef": "sample-goal.md",
        "sourceLine": 17
      },
      {
        "id": "goal:1/task:300",
        "phaseId": "goal:1/phase:50",
        "sourceStatus": "pending",
        "readiness": "waiting",
        "dependsOn": [
          "goal:1/task:220"
        ],
        "evidenceHint": null,
        "sourceRef": "sample-goal.md",
        "sourceLine": 21
      }
    ]
  },
  "warnings": [],
  "errors": []
}
```

### 5.2 필드 계약

| 필드 | 형식 | 규칙 |
|---|---|---|
| `schemaVersion` | `1` | JSON 계약 버전 |
| `valid` | boolean | `errors`가 비면 `true`, 하나라도 있으면 `false` |
| `activeGoal` | object 또는 `null` | 활성 Goal이 없거나 안전하게 투영할 수 없으면 `null` |
| `activeGoal.id` | `goal:N` | frontmatter Goal 번호로 만든 qualified string |
| `activeGoal.title` | string 또는 `null` | frontmatter title, 누락 시 `null` + warning |
| `activeGoal.sourceStatus` | GoalStatus 또는 `null` | 유효한 Goal 상태를 보존, 누락·비표준 값은 `null` + warning |
| `activeGoal.phases` | `{ id: string }[]` | qualified Phase ID, 문서 순서, 번호 결번 허용 |
| `activeGoal.tasks` | Task[] | 문서 순서의 평탄한 배열 |
| `warnings` | Diagnostic[] | 호환 가능한 누락·불확실성 |
| `errors` | Diagnostic[] | exit 1을 만드는 구조·읽기·공개 경계 오류 |

Task 공개 필드는 아래 여덟 개로 고정한다.

| 필드 | 형식 |
|---|---|
| `id` | `goal:N/task:N` |
| `phaseId` | `goal:N/phase:N` |
| `sourceStatus` | `pending \| completed \| notApplicable` |
| `readiness` | `ready \| waiting \| terminal` |
| `dependsOn` | string[] |
| `evidenceHint` | string 또는 `null` |
| `sourceRef` | string |
| `sourceLine` | positive integer |

`sourceRef`는 Goal source root 기준 상대경로다. `/` 구분자를 사용하고 절대경로, `..`, drive prefix,
Goal source root 자체의 접두사와 로컬 상태 디렉터리를 포함하지 않는다. 같은 Goal에서 나온 Task는
같은 `sourceRef`를 가진다. `sourceLine`은 전체 Goal Markdown에서 Task가 있는 1-based 줄 번호다.

필드 순서와 배열 순서는 정상 예시처럼 고정한다. 현재 시각, Git revision, 실행 위치와 실행 표면
식별자는 넣지 않는다.

### 5.3 diagnostics

`Diagnostic`은 안정적인 code와 선택적 줄 번호만 가진다.

```json
{
  "code": "DUPLICATE_TASK_ID",
  "sourceLine": 12
}
```

- 원문, 입력 경로, 예외 message와 stack은 넣지 않는다.
- diagnostics는 발견 순서로 정렬하고 같은 code·sourceLine 조합만 중복 제거한다.
- 구조 오류가 하나라도 있으면 부분 그래프를 소비하지 못하게 `valid: false`, `activeGoal: null`로
  반환하고 exit 1로 끝낸다.

```json
{
  "schemaVersion": 1,
  "valid": false,
  "activeGoal": null,
  "warnings": [],
  "errors": [
    {
      "code": "INCOMPATIBLE_FLAGS"
    }
  ]
}
```

최소 warning code:

| code | 조건 |
|---|---|
| `NO_ACTIVE_GOAL` | 기존 선택 순서로 고를 Goal이 없음 |
| `NO_PHASES` | 활성 Goal 본문에 Phase가 없음 |
| `MISSING_GOAL_TITLE` | Goal title이 없거나 비어 있음 |
| `UNKNOWN_GOAL_STATUS` | Goal status가 없거나 기존 GoalStatus가 아님 |

최소 error code:

| code | 조건 |
|---|---|
| `INVALID_PHASE_SYNTAX` | Phase 모양 heading의 문법이 잘못됨 |
| `INVALID_PHASE_ID` | Phase ID가 양수가 아님 |
| `DUPLICATE_PHASE_ID` | Phase ID 중복 |
| `OUT_OF_ORDER_PHASE_ID` | Phase ID가 앞 ID보다 작음 |
| `EMPTY_PHASE` | Phase에 Task가 없음 |
| `TASK_WITHOUT_PHASE` | Task 모양 checklist 앞에 Phase가 없음 |
| `INVALID_TASK_SYNTAX` | Task 모양 checklist의 checkbox·label·설명이 잘못됨 |
| `INVALID_TASK_ID` | Task ID가 양수가 아님 |
| `DUPLICATE_TASK_ID` | Goal 전체 Task ID 중복 |
| `OUT_OF_ORDER_TASK_ID` | Task ID가 앞 ID보다 작음 |
| `CHECKED_NOT_APPLICABLE_TASK` | 완료 checkbox와 `` `(na)` `` marker가 함께 있음 |
| `INVALID_EVIDENCE_HINT` | evidence 구분자 뒤가 비어 있음 |
| `UNCLOSED_CODE_FENCE` | 코드 펜스가 닫히지 않음 |
| `INCOMPATIBLE_FLAGS` | `--compact`와 `--json`을 함께 사용 |
| `PUBLIC_BOUNDARY_VIOLATION` | 파생 문자열에서 공개 금지 정보가 감지됨 |
| `GOAL_READ_FAILED` | Goal을 안전하게 읽거나 파싱할 수 없음 |

구현은 더 구체적인 code를 additive로 추가할 수 있지만 같은 오류의 기존 code 의미를 바꾸지 않는다.

### 5.4 Phase가 없는 Goal

Phase heading이 하나도 없으면 호환 가능한 legacy Goal로 본다. `valid: true`, `activeGoal.phases: []`,
`activeGoal.tasks: []`, `NO_PHASES`, 빈 `errors`로 exit 0을 반환한다. Phase 문법과 비슷하지만 잘못된
heading이나 Phase 밖 Task가 있으면 legacy로 낮추지 않고 구조 오류로 처리한다.

활성 Goal이 없으면 `valid: true`, `activeGoal: null`, `NO_ACTIVE_GOAL`, 빈 `errors`로 exit 0을
반환한다.

## 6. 공개 경계

Goal에서 파생된 모든 문자열은 JSON 직렬화 전에 함께 검사한다. 다음 항목이 감지되면 부분
redaction으로 계속하지 않고 전체 투영을 차단한다.

- 시크릿과 토큰
- 홈 디렉터리 절대경로
- 개인 이메일·실명·개인 저장소 이름
- 실제 외부 서비스 객체 ID

차단 결과는 `PUBLIC_BOUNDARY_VIOLATION` code만 포함하며 입력 원문, 감지 문자열, 입력 경로와 예외를
stdout·stderr에 출력하지 않는다. `sourceRef`는 Goal source root 기준 상대 참조만 출력하고 Goal
source root·로컬 상태 디렉터리 접두사나 로컬 절대경로를 넣지 않는다. 예제 값은 `sample-*`,
`<HOME>` 또는 명백한 가짜 값만 쓴다.

## 7. CLI 계약과 호환성

```text
vhk context --json
```

- TTY를 요구하지 않는다.
- stdout에는 `WorkContextV1` JSON 하나만 출력한다.
- 사람용 headline, spinner, 다음 단계 문구와 stack trace를 stdout에 섞지 않는다.
- 성공과 호환 warning은 exit 0, 구조·읽기·공개 경계 오류는 exit 1이다.
- `vhk context --compact --json`은 `valid: false`, `INCOMPATIBLE_FLAGS`, exit 1인 JSON 오류다.
- 어떤 성공·실패 경로에서도 파일을 만들거나 수정하지 않는다.
- 기존 `vhk context`와 `vhk context --compact`의 파일 생성·사람용 출력은 그대로 유지한다.
- 기존 Goal 명령, Goal 선택 순서, Goal 완료 검사와 MCP 도구·시그니처는 그대로 유지한다.

## 8. 구현 단위와 순서

### Goal 134 — Goal Phase/Task 파서와 투영

1. ADR·RFC와 roadmap·PRD 계약 확정
2. BOM·CRLF와 코드 펜스를 처리하는 Markdown 파서와 타입
3. 양수·고유·오름차순 번호, 결번, checkbox와 `` `(na)` `` 상태 검증
4. 직전 Phase Task 전체 `dependsOn`과 terminal/readiness 투영
5. 두 evidence hint 문법과 4 Phase·11 Task 도그푸딩 fixture golden test

### Goal 135 — 안전한 context JSON

1. 기존 context 명령에 additive `--json` 배선
2. `WorkContextV1` 직렬화와 안정적인 diagnostics
3. 상대 `sourceRef`, 1-based `sourceLine`과 공개 경계 차단
4. 성공·legacy·오류·flag 충돌 경로 무쓰기와 stdout/exit code 검증
5. 기존 사람용 context·Goal·MCP 회귀 검증

Goal 134가 완료된 뒤 Goal 135를 시작한다. 두 Goal이 완료된 뒤 2.14 계측 작업을 시작한다.

## 9. 검증 계획

| 영역 | 필수 검증 |
|---|---|
| Phase ID | 양수·고유·오름차순, 결번 허용, 중복·역순·빈 Phase 차단 |
| Task ID | Goal 전체 양수·고유·오름차순, 결번 허용, 중복·역순·Phase 밖 Task 차단 |
| 상태 | pending·completed·notApplicable, checked+`(na)` 충돌 차단 |
| readiness | 두 terminal 상태, 첫 Phase pending ready, 직전 Phase 전체 terminal 장벽 |
| 의존성 | 첫·같은 Phase 빈 배열, 다음 Phase에 직전 Phase Task ID 전량 |
| evidence | `/ 증거:`·`/ evidence:` 동등, null, 빈 hint 오류 |
| 코드 펜스 | backtick·tilde 안의 예시 제외, 미종료 fence 차단 |
| 인코딩 | UTF-8 BOM·LF·CRLF에서 같은 구조와 1-based sourceLine |
| legacy | Phase 없는 Goal이 빈 phases/tasks + `NO_PHASES`, exit 0 |
| 오류 | `valid: false` JSON, `--compact --json` 포함 exit 1, 원문·stack 부재 |
| source | 안전한 상대 sourceRef, 로컬 root·절대경로·`..` 부재 |
| 무쓰기 | Goal과 로컬 상태 파일의 내용·mtime 불변 |
| 회귀 | 사람용 context, Goal 명령, MCP API와 공개 시그니처 불변 |
| 도그푸딩 | 소비자 복사본 변경 없이 4 Phase·11 Task를 같은 순서로 읽음 |

검증이 실패하면 Goal을 완료로 표시하지 않는다.

## 10. RFC 0064에서 달라진 점

| RFC 0064 | RFC 0065 |
|---|---|
| Goal 하나를 `ProjectedTask` 하나로 변환 | Goal 안의 Phase와 평탄한 Task 그래프를 투영 |
| roadmap·PRD acceptance criteria 결합 | 제품 원본은 유지하되 JSON에는 결합하지 않음 |
| blockers·verification plan·Git revision 포함 | 활성 Goal의 Phase/Task와 diagnostics만 포함 |
| Goal 상태를 별도 projected status로 매핑 | Task checkbox와 `` `(na)` ``에서 source status 계산 |
| Task별 완료 증거 부재를 중심으로 보수 매핑 | evidence hint를 비권위 안내로 분리 |

RFC 0064의 Task 저장·쓰기, 신규 MCP와 scheduler 제외 원칙은 유지한다. 구체적인 타입과 JSON은 이
문서가 대체한다.

## 11. 관련

- [ADR-017](../adr/ADR-017-goal-phase-task-read-only-projection.md)
- [ADR-012](../adr/ADR-012-agent-agnostic-core-and-method-absorption.md)
- [ADR-010](../adr/ADR-010-goal-sot-and-public-boundary.md)
- [RFC 0064](0064-agent-agnostic-task-spine.md) — 대체된 이전 제안
