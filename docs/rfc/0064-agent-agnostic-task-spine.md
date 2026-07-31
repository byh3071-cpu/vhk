---
rfc: 0064
title: Agent-agnostic Task Spine
status: Proposed
created: 2026-07-31
relates: ADR-012, ADR-010, RFC-0054, RFC-0057
---

# RFC 0064 — 에이전트 비종속 Task Spine

> 용어: ADR-011 대응표 참조.
>
> 상태: **Proposed — ADR-012 승인 전 구현 금지.** 이 문서는 계약과 검증 계획을 제안하며,
> 현재 Goal·CLI·MCP가 이미 이 설계를 구현한다고 주장하지 않는다.

## 0. 가장 짧은 설명

VHK가 프로젝트마다 같은 질문에 답할 수 있게 하는 작은 공통 척추를 추가한다.

1. 무엇을 왜 만드는가?
2. 지금 실행 가능한 다음 작업은 무엇인가?
3. 무엇이 막혔고 누구의 승인이 필요한가?
4. 어떤 증거가 있어야 완료인가?
5. 다음 에이전트가 무엇을 이어받아야 하는가?

사용자에게 보이는 기본 흐름은 단순하게 유지한다.

```text
DEFINE → EXECUTE → VERIFY
```

Task Graph, Context Compiler, 실행 모드, 증거와 개선 후보는 이 세 동작을 정확히 수행하기 위한 내부 계약이다.

## 1. 목표와 비목표

### 목표

- 기존 Goal을 깨지 않고 부모·자식·의존성·차단·승인·증거를 표현한다.
- 프로젝트 저장소만 있어도 다른 에이전트가 현재 상태와 다음 작업을 이어받을 수 있게 한다.
- 질문·리서치가 필요한 회색 영역을 숨은 가정으로 바꾸지 않고 명시적으로 닫는다.
- 한 세션에 하나의 실행 루프 권한자만 두고, 작업 크기와 위험에 맞는 실행 방식을 선택한다.
- 완료 주장 대신 수용 기준과 검증 증거를 저장한다.
- 반복된 성공·실패에서 개선 후보를 만들되, 공통 규칙 승격은 검증과 사람 승인을 거친다.

### 비목표

- 새로운 중앙 프로젝트 관리 서비스나 범용 문서 편집기를 만드는 것
- 현재 Goal, CLI 인자, MCP 도구 또는 .vhk 파일 형식을 즉시 교체하는 것
- 캘린더 엔진, 모바일 동기화, 클라우드 운영 DB를 이 RFC에서 선택하는 것
- 모든 정보 수집과 아이디어 대화를 VHK 절차로 강제하는 것
- 모든 작업에 TDD·멀티에이전트·장문 계획을 강제하는 것
- 자동 머지, 무인 배포, 삭제·결제·권한 변경을 승인 없이 실행하는 것

## 2. 활성화 경계와 핵심 흐름

### 2.1 DISCOVER는 입력 계층이다

링크 저장, 아이디어 발산, 리서치, 질문과 자유 대화는 VHK 실행 루프 밖에서 진행할 수 있다.
그 결과가 실제 제품 작업으로 승격될 때 아래 DefinitionPacket으로 고정한다.

```text
DISCOVER / INBOX / RESEARCH
          │
          │ 실제로 만들기로 결정
          ▼
        DECIDE
          ▼
        DEFINE
          ▼
        EXECUTE
          ▼
        VERIFY
```

VHK는 DISCOVER 도구를 대체하지 않는다. 대신 출처, 결정, 미확인 위험과 버린 대안을 받아서 다음
에이전트가 다시 전체 대화를 읽지 않아도 되는 입력 패킷으로 만든다.

### 2.2 회색 영역은 한 질문씩 닫는다

DEFINE 단계의 질문은 다음 규칙을 따른다.

1. 구현 방향을 바꾸는 가장 영향 큰 질문 하나를 고른다.
2. 쉬운 설명과 2~3개 선택지, 추천안과 이유를 제시한다.
3. 답을 decisions 또는 assumptions에 기록하고 질문의 resolution_ref로 연결한다.
4. 외부 사실 확인이 필요하면 research로 분리하고 결과·확인일·출처를 붙인다.
5. 높은 영향의 미해결 질문이 있으면 ready로 전이하지 않는다.
6. 낮은 영향의 질문은 되돌리기 조건을 적은 가정으로 진행할 수 있다.

긴 원문이나 리서치 묶음은 별도 비공개 보관소가 원문을 소유할 수 있다. 공개 프로젝트에는 개인
대화 원문을 복사하지 않고, 검증 가능한 결정·근거·범위·미해결 질문만 남긴다.

## 3. 책임과 원본

| 데이터 | 원본 | VHK가 하는 일 | 외부 표면이 하는 일 |
|---|---|---|---|
| 코드·테스트·프로젝트 문서 | 프로젝트 Git | 변경·검증 | 조회·링크 |
| 제품 작업 인스턴스·완료 조건 | 프로젝트 Git의 추적 작업 문서. 현재 VHK는 roadmap·PRD(ADR-010) | 파싱·상태 전이·투영 | 통합 표시·승인 요청 |
| 기존 Goal 실행 카드 | 비추적 파생물 | 존재할 때 실행 상태 보조 입력으로 읽음 | 원본처럼 표시 금지 |
| 정규화 Task Graph | 파생물 | 원본에서 결정론적으로 생성 | 읽기 최적화 복제 가능 |
| 검증 증거 | 프로젝트 Git 또는 명시된 artifact 참조 | 수집·무결성 확인 | 요약 표시 |
| 개인 우선순위·통합 Inbox | 외부 개인 레이어 | 소유하지 않음 | 직접 관리 가능 |
| 캘린더 시간 블록 | 외부 캘린더 | 이번 RFC에서는 읽기 계약만 고려 | 일정 표시 |

핵심 불변식은 다음과 같다.

```text
Task 인스턴스 원본 = 해당 프로젝트의 추적 작업 문서
Goal 실행 카드     = 원본에서 다시 만드는 비추적 파생물
정규화 Graph       = 다시 만들 수 있는 파생물
외부 관제 표면      = 단일 통제 지점일 수 있으나 Task 원본은 아님
```

외부 표면의 쓰기는 파일 직접 수정 API가 아니라 start_task, record_task_result 같은 의미 기반 상태
전이로만 요청한다. 저장 성공 전에는 UI가 낙관적으로 완료를 표시하지 않는다.

### 3.1 모든 직렬화 객체의 공개 경계

DefinitionPacket, TaskContract, WorkContext, EvidenceRef, Approval, Run 이벤트, EvolutionCandidate,
projection cache 전부에 ADR-010의 공개 경계를 적용한다. 공개 리포트 단계에서만 가리는 것이 아니라
**저장소에 직렬화하기 전에** 검사한다.

- 파일 참조는 저장소 상대경로만 허용한다. 로컬 절대경로는 거부한다.
- 시크릿, 개인 이메일·실명, 개인 저장소명, 실제 외부 서비스 객체 ID는 거부한다.
- changed_files도 저장소 상대경로만 허용한다.
- artifact_ref는 저장소 상대경로 또는 승인된 content-addressed 공개 artifact만 허용한다.
- 비공개 원문은 공개 저장소에 locator를 남기지 않는다. visibility, kind, digest와 외부 개인 레이어가
  해석하는 불투명 private_ref만 남기며, 실제 경로·서비스 ID 매핑은 비추적 개인 저장소가 소유한다.
- 경계 위반 객체는 마스킹 후 저장하지 않고 쓰기 자체를 실패시킨다. 별도의 공개용 파생 리포트만
  검증된 마스킹을 거쳐 생성할 수 있다.

## 4. DefinitionPacket.v1

실제로 만들기로 결정한 시점의 최소 입력이다. 아래는 형식 초안이며 물리 파일 경로는 아직 결정하지 않는다.

```yaml
schema_version: DefinitionPacket.v1
project_id: sample-app
problem: 사용자가 겪는 문제를 한 문단으로 설명
target_user: 이 문제를 실제로 겪는 사람
desired_outcome: 구현물이 만든 사용자 변화

scope:
  in:
    - 이번 반복에서 반드시 포함할 것
  out:
    - 의도적으로 하지 않을 것

success_criteria:
  - 외부에서 관찰 가능한 성공 조건

constraints:
  - 기존 공개 API를 깨지 않는다

sources:
  - kind: decision
    visibility: public
    ref: docs/decisions/sample.md
    digest: sha256:sample-digest

decisions:
  - id: D-001
    question_ref: Q-001
    choice: 선택한 방향
    rationale: 선택 이유
    source_refs:
      - docs/decisions/sample.md
    decided_at: 2026-07-31

assumptions:
  - id: A-001
    statement: 검증 전 임시 가정
    impact: low
    falsification_condition: 가정이 틀렸음을 판정하는 조건
    rollback_condition: 되돌릴 조건
    expires_at: null
    status: active

rejected_alternatives:
  - option: 선택하지 않은 방향
    reason: 제외 이유

risks:
  - id: R-001
    impact: medium
    mitigation: 완화 방법

open_questions:
  - id: Q-001
    question: 구현 방향을 바꾸는 질문
    impact: high
    status: resolved
    resolution_ref: D-001

research:
  - id: RS-001
    question: 시간에 따라 바뀔 수 있는 외부 사실
    impact: high
    status: completed
    result: 공식 문서에서 확인한 결과
    source_refs:
      - https://example.com/official-docs
    checked_at: 2026-07-31

build_decision:
  status: adopted
  decided_at: 2026-07-31
```

### 준비 판정

DefinitionPacket은 아래가 모두 참일 때만 Task Graph 생성 입력이 된다.

- 문제, 대상 사용자, 원하는 결과가 비어 있지 않다.
- 범위 IN과 OUT이 최소 1개 이상 있다.
- 검증 가능한 성공 조건이 있다.
- high 영향 open question이 0개이고, resolved 질문마다 유효한 decision 또는 assumption 참조가 있다.
- high 영향 active assumption에는 반증·롤백 조건이 있고 만료되지 않았다.
- high 영향 pending research가 0개다. 완료 research에는 결과·source_refs·checked_at이 있다.
- rejected_alternatives와 risks가 없으면 빈 배열로 명시해 누락과 “없음”을 구분한다.
- build_decision.status가 adopted다.

## 5. TaskContract.v0

### 5.1 최소 스키마

```yaml
schema_version: TaskContract.v0
project_id: sample-app
id: SAMPLE-042
title: 로그인 실패 메시지 개선
type: feature
status: ready
priority: P1

source:
  kind: tracked_work_doc
  ref: docs/roadmap/product-roadmap.md
  revision: sample-sha
  source_order: 42
  legacy_goal: null

parent_id: SAMPLE-040
dependency_ids:
  - SAMPLE-041

scope:
  include:
    - src/auth/
  exclude:
    - database-schema

acceptance_criteria:
  - 실패 시 안전한 메시지를 표시한다
  - 기존 성공 흐름을 깨뜨리지 않는다

verification:
  required:
    - typecheck
    - unit-test
    - browser-test
  evidence_refs: []

assurance:
  status: unverified
  warnings: []

execution:
  mode: guided
  risk: medium
  owner: unassigned
  loop_authority: vhk

blocking:
  reason: null
  approval_ref: null

result:
  changed_files: []
  summary: null
  remaining_risks: []

revision: 1
created_at: 2026-07-31
updated_at: 2026-07-31
```

필수 필드는 schema_version, project_id, id, title, status, priority, source, acceptance_criteria,
verification.required, assurance.status, execution.mode, execution.risk, revision이다. 나머지는 점진 도입을
위해 optional로 시작할 수 있다. 전역 식별키는 project_id와 id의 조합이며, 외부 관제 표면은 id만으로
Task를 조회하거나 수정하지 않는다.

priority v0는 기존 Goal과 같은 P0, P1, P2만 허용한다. 새 high/medium/low 어휘는 도입하지 않는다.
assurance.status는 verified, unverified, missing_evidence, stale, not_applicable 중 하나이며, 원본 상태를
바꾸지 않고 검증 신뢰도를 별도로 표현한다.

### 5.2 상태 모델

정상 흐름:

```text
defined → ready → in_progress → verification → done → released
```

예외 상태:

| 상태 | 의미 | 복귀 조건 |
|---|---|---|
| blocked | 외부 조건 때문에 진행 불가 | blocking.reason 해소 |
| deferred | 하기로 했지만 시점을 미룸 | 재개 결정과 우선순위 지정 |
| canceled | 더 이상 하지 않기로 결정 | 새 결정 없이는 복귀 금지 |
| superseded | 다른 Task가 목적을 대체 | 대체 Task 참조 필수 |
| observing | 구현보다 관찰 조건을 기다림 | 관찰 기준 충족 또는 별도 결정 |

상태 전이 규칙:

아래 규칙은 Task-native 쓰기 경로에 적용한다. 기존 Goal의 읽기 전용 호환 투영은 source_status를
그대로 보존하고 assurance를 별도 표시하므로, 과거 DONE을 자동 재작성하지 않는다.

- ready: 의존 Task가 모두 done 또는 released이고, 수용 기준·검증 계획·범위가 존재해야 한다.
- in_progress: 실행 주체와 Run 식별자를 기록해야 한다.
- verification: 구현 결과와 최소 한 개의 evidence_ref가 있어야 한다.
- done: required 검증이 전부 통과하고 미충족 수용 기준이 0이어야 한다.
- released: 별도 릴리스 조건과 사람 승인 정책을 통과해야 한다.
- blocked: blocking.reason 없이 전이할 수 없다.
- canceled·superseded: 결정 근거와 대체 참조를 보존한다.

### 5.3 기존 Goal 상태와 검증 신뢰도 투영

Task Spine은 ADR-010의 추적 roadmap·PRD를 원본으로 읽는다. 비추적 Goal 실행 카드가 존재하면 상태를
보조 입력으로 읽되, TaskContract의 source.legacy_goal에 출처와 source_status를 보존한다.

| Goal source_status | Task status | assurance / 경고 |
|---|---|---|
| NOT_STARTED | defined | ready 조건 충족 여부는 별도 계산. 호환 next에서는 원본 순서 보존 |
| IN_PROGRESS | in_progress | 실행 주체가 없으면 unverified + 경고 |
| DONE | done | 일치하는 완료 증거가 있으면 verified, 없으면 missing_evidence. status 자체는 하향하지 않음 |
| BLOCKED | blocked | 차단 이유가 없으면 unverified + 경고 |
| CANCELED | canceled | 결정 근거가 없으면 경고 |
| DEFERRED | deferred | 재개 조건이 없으면 경고 |
| OBSERVING | observing | 관찰 조건이 없으면 경고 |

투영은 단방향·결정론적이어야 한다. 첫 구현에서 TaskContract를 수정해 추적 roadmap·PRD나 파생 Goal에
역쓰기하지 않는다. missing_evidence인 기존 DONE은 호환 표시에선 DONE을 보존하지만 released 전이,
외부 실행, “검증 완료” 주장에는 사용할 수 없다.

### 5.4 next 선택 호환성과 Task-native 정렬

Wave 1의 compatibility 모드는 기존 Goal 알고리즘을 그대로 보존한다.

1. source_status IN_PROGRESS 중 기존 소스 순서의 첫 항목
2. 없으면 source_status NOT_STARTED 중 기존 소스 순서의 첫 항목
3. 기존 CLI가 사용하지 않는 dependency·priority는 next 결과를 바꾸지 않고 경고·보조 정보로만 표시

Task-native 선택은 별도 opt-in 뒤에만 연다. 그때는 ready Task만 대상으로 P0 → P1 → P2,
source.source_order, project_id + id 오름차순으로 안정 정렬한다. 두 모드를 같은 결과라고 주장하지 않고,
모드와 선택 근거를 출력한다.

## 6. Task Graph 불변식

1. dependency_ids는 존재하는 Task만 가리킨다.
2. 의존성 그래프는 순환이 없어야 한다.
3. blocked·canceled·superseded Task는 자동 선택하지 않는다.
4. ready 후보 중에서도 현재 범위·우선순위·승인 정책을 통과한 Task만 next가 된다.
5. 부모 Task는 하위 Task가 모두 완료돼도 자기 수용 기준 검증 없이 자동 done이 되지 않는다.
6. parallel은 의존 관계가 없고 소유 파일 범위가 겹치지 않을 때만 선택한다.
7. 같은 파일을 수정할 가능성이 있으면 직렬화하거나 명시적 소유권 분리를 요구한다.
8. Task 삭제 대신 canceled 또는 superseded를 사용해 이력을 보존한다.

## 7. 실행 모드와 단일 루프

| 모드 | 사용 조건 | 기본 승인 경계 |
|---|---|---|
| native | 질문·리서치·작은 탐색, VHK 실행 루프 밖 | 외부 쓰기 없음 |
| guided | 요구가 일부 열려 있거나 중간 판단이 필요한 작업 | 지정 지점에서 사람 승인 |
| auto | 범위·수용 기준·검증이 명확한 단일 작업 | 로컬 변경·검사, PR 전까지 정책 따름 |
| parallel | 독립 Task가 2개 이상이고 충돌 범위가 없음 | worktree 분리, 병합 사람 판정 |
| recovery | 재현 가능한 실패·회귀를 원인부터 수정 | 증상 패치 금지, 재현 증거 필요 |
| release | 최종 검증·릴리스 준비 | 배포·publish·merge 사람 승인 |

모드가 달라도 `execution.loop_authority`는 한 값만 가진다. 다른 오케스트레이터를 보조 도구로 호출할
수는 있지만, 재시도·상태 전이·완료 판정 권한은 loop_authority 하나만 가진다.

auto와 release는 설명용 정책 값이다. RFC 0054의 외부 실행력 재개 조건과 ADR-009의 별도 활성화가
충족되기 전에는 외부 발송·배포·publish·merge 권한을 열지 않는다.

## 8. Context Compiler 계약

에이전트에게 프로젝트 전체를 통째로 넣지 않고, 현재 Task에 필요한 문맥만 조립한다.

```yaml
schema_version: WorkContext.v0
project:
  id: sample-app
  goal: 현재 프로젝트 목표
  phase: implementation

task:
  id: SAMPLE-042
  title: 로그인 실패 메시지 개선
  status: ready

dependencies: []
decisions: []
constraints: []
relevant_files: []
known_failures: []
acceptance_criteria: []
verification_plan: []
approval_boundaries: []
open_questions: []
remaining_risks: []

source_revisions:
  task_revision: 1
  git_sha: sample-sha
```

Context Compiler는 다음 원칙을 지킨다.

- 모든 기억을 넣지 않고 현재 의도에 필요한 항목만 선택한다.
- 결정과 근거를 포함하되 내부 사고 과정을 저장하거나 재생하지 않는다.
- 출처와 리비전을 붙여 오래된 문맥을 감지할 수 있게 한다.
- 정보가 없으면 추측으로 채우지 않고 unknown 또는 open question으로 남긴다.
- 파일 범위·금지 범위·검증 명령을 실행 전에 함께 제공한다.

## 9. 의미 기반 Agent Interface

아래 이름은 생태계 수준의 의미 계약 초안이다. 현재 VHK MCP의 GA 도구 이름을 변경하거나 즉시
추가한다는 뜻이 아니다. ADR 승인 뒤 별도 RFC/티켓에서 실제 표면과 호환성을 정한다.

### 읽기

| 동작 | 결과 |
|---|---|
| get_work_context | 현재 Task에 맞춘 WorkContext 반환 |
| get_next_tasks | 의존성·차단·우선순위를 통과한 Task 목록 |
| get_task | TaskContract와 현재 revision 반환 |
| get_pending_task_approvals | 사람 판정 대기 항목 반환 |

### 제한된 쓰기

| 동작 | 허용 범위 |
|---|---|
| start_task | ready → in_progress, actor·run·expected_revision 기록 |
| record_task_result | 결과·변경 파일·위험을 append |
| record_task_evidence | 검증 명령·종료코드·artifact 참조를 append |
| request_task_approval | 승인 요청 생성, Task를 임의 완료하지 않음 |
| record_task_approval_decision | 인증된 사람 표면이 승인·거절·철회·만료 결정을 append |

공통 쓰기 조건:

- idempotency_key 필수
- actor와 run_id 필수
- expected_revision 불일치 시 쓰기 거부
- append-only 이벤트와 최종 materialized state를 구분
- 삭제·전체 덮어쓰기·임의 done 전이 없음
- complete_task는 검증된 완료 판정 계약이 별도로 승인되기 전 제공하지 않음

idempotency_key, actor, run_id, expected_revision은 각 도메인 객체에 반복 저장하는 필드가 아니라 모든
mutation을 감싸는 공통 MutationEnvelope.v0의 필드다. record_task_approval_decision은 같은 envelope를
쓰되 agent principal에는 노출하지 않고, 인증된 사람 control surface에서만 호출한다.

### 9.1 ApprovalRequest.v0 / ApprovalDecision.v0

```yaml
request:
  schema_version: ApprovalRequest.v0
  id: APR-001
  project_id: sample-app
  task_id: SAMPLE-042
  action: release
  scope:
    - artifact: sample-package
  risk: high
  reason: 사람 판정이 필요한 이유
  requester_actor: agent:sample
  expected_revision: 1
  status: pending
  requested_at: 2026-07-31T00:00:00Z
  expires_at: 2026-08-01T00:00:00Z

decision:
  schema_version: ApprovalDecision.v0
  request_id: APR-001
  decision: approved
  actor: human:owner
  reason: 승인 또는 거절 근거
  constraints: []
  decided_at: 2026-07-31T01:00:00Z
  revision: 1
```

ApprovalRequest status는 pending, approved, rejected, revoked, expired를 허용한다. ApprovalDecision은
approved, rejected, revoked, expired 중 하나를 append하고 이전 결정을 덮어쓰지 않는다.

불변식:

- 승인 결정은 인증된 사람 표면만 기록할 수 있다. 에이전트의 self-approval은 거부한다.
- approved는 지정된 action·scope·revision·만료 시점에만 유효하다.
- revision이 바뀌거나 expires_at이 지나면 다시 요청한다.
- revoked는 아직 실행되지 않은 권한을 즉시 무효화한다.
- 승인 기록은 Task를 done/released로 바꾸거나 배포·publish·merge를 실행하지 않는다. 실제 행동은
  별도의 검증·실행 계약과 다시 대조한다.
- 공개 저장 시 actor는 역할 또는 불투명 식별자만 사용하고 개인 실명·이메일을 넣지 않는다.

## 10. 검증 증거와 완료 판정

EvidenceRef 최소 필드:

```yaml
kind: test
command: pnpm.cmd run test:run
exit_code: 0
captured_at: 2026-07-31T00:00:00Z
run_id: run-sample
artifact_ref: null
sha: sample-sha
```

규칙:

1. required 검증마다 최신 source revision과 일치하는 증거가 있어야 한다.
2. 코드 변경 뒤 이전 증거는 stale로 표시한다.
3. 스크린샷·LLM 리뷰는 보조 증거이며 종료 코드 기반 검사를 대신하지 않는다.
4. 인증·결제·권한·삭제·마이그레이션은 일반 green 외에 별도 사람 검토를 요구한다.
5. 실패 증거를 삭제하지 않고 뒤의 성공 증거와 원인·수정 요약을 연결한다.
6. 공개 리포트는 시크릿·개인 경로·외부 실제 ID를 마스킹한다.

## 11. 개선 후보와 승격

```yaml
schema_version: EvolutionCandidate.v0
id: EVO-001
kind: rule
scope: project
signal_refs: []
hypothesis: 이 규칙이 재작업을 줄일 것이다
baseline: null
experiment: null
result: null
status: proposed
rollback_ref: null
```

상태 흐름:

```text
proposed → testing → verified → promoted
                    └────────→ rejected
promoted → observing → rolled_back
```

- 반복 신호만 후보로 만든다. 한 번의 취향이나 우연한 실패는 자동 규칙이 아니다.
- baseline, 비교 지표, 적용 범위, 롤백 대상이 없는 후보는 testing으로 갈 수 없다.
- 프로젝트 로컬 후보와 범용 후보를 분리한다.
- 여러 프로젝트에 적용되는 Rule·Skill·Workflow 승격은 사람 승인 필수다.
- 승격 뒤 품질·시간·재작업이 악화되면 자동 경고하고 사람 판정으로 롤백한다.

## 12. 외부 방법론 흡수 매핑

| 원리 | Task Spine 반영 위치 |
|---|---|
| OMC의 한 주 실행 루프 | execution.loop_authority와 §7 단일 루프 불변식 |
| 작업 규모별 실행 방식 | execution.mode와 위험 기반 승인 정책 |
| Superpowers의 구현 전 요구 확인 | DefinitionPacket과 ready 판정 |
| 원인 중심 디버깅 | recovery 모드와 known_failures·재현 증거 |
| 위험 기반 테스트·독립 검증 | verification.required와 EvidenceRef |
| Shrimp의 지속 Task·의존성 | TaskContract와 DAG 불변식 |
| 다음 실행 가능 작업 계산 | get_next_tasks와 ready 규칙 |
| Caveman의 선택적 압축 | 표시 계층 옵션, 저장 계약에는 영향 없음 |

이 매핑은 외부 플러그인을 설치했다는 뜻이 아니다. 실제 코드 재사용은 별도 라이선스·보안 검토를 거친다.

## 13. 점진 도입 계획

### Wave 0 — 문서와 승인

- ADR-012와 이 RFC를 Proposed로 리뷰한다.
- 기존 Goal·RFC 0057·ADR-010과 충돌 여부를 검증한다.
- 관리자 승인 전 코드는 변경하지 않는다.

### Wave 1 — 읽기 전용 투영

- TaskContract·DefinitionPacket 타입과 파서를 additive로 추가한다.
- ADR-010의 추적 roadmap·PRD 원본 → 비추적 Goal 실행 카드 → TaskContract 읽기 투영 순서를 명시한다.
- Goal 카드가 없는 새 clone에서도 추적 원본만으로 작업 정의를 읽고, 실행 상태가 없다는 사실을 unknown으로 표시한다.
- source_status는 보존하고 assurance를 분리하며, compatibility next가 기존 CLI 선택 순서와 정확히 같은지 golden test로 비교한다.
- 파일 경로와 serialization은 이 Wave의 별도 승인 티켓에서 확정한다.

### Wave 2 — Context Compiler

- WorkContext를 읽기 전용으로 생성한다.
- 출처 revision, stale, unknown, open question을 검증한다.
- 에이전트 두 종류 이상에서 같은 입력이 같은 핵심 문맥을 만드는지 도그푸딩한다.

### Wave 3 — 제한된 의미 쓰기

- start, result/evidence append, approval request와 인증된 사람의 approval decision 기록만 연다.
- expected_revision과 idempotency를 먼저 검증한다.
- done·delete·full update는 열지 않는다.
- Approval 계약·인증·만료·철회 테스트가 끝나기 전 released 또는 승인 의존 상태 전이를 열지 않는다.
- rollback 때 append 이벤트를 삭제하지 않고 원본 revision과 재대조해 applied, pending, rejected로 reconciliation한다.

### Wave 4 — 외부 관제 표면

- 첫 화면은 current focus, next task, blocker/approval만 표시한다.
- 원본 쓰기 실패·revision 충돌을 숨기지 않고 사용자에게 보여준다.
- 캘린더 쓰기, 통합 DB 재설계, 복잡한 대시보드는 후속으로 둔다.

### Wave 5 — 개선과 플러그인 정리

- EvolutionCandidate 실험·승격·롤백을 도그푸딩한다.
- 기존 plugin, hook, skill, command의 정규화 scope(global/project/local)·버전·활성 상태·소유 설정을 inventory한다. 절대 설치 경로는 기록하지 않는다.
- Caveman·Superpowers는 제거 후보로 감사하되 **ADR-012 승인은 제거 승인이 아니다.** 대상별 별도 사람 승인을 받는다.
- 기준선 지표는 작은 작업의 완료 시간·턴 수·출력 길이·재작업·검사 결과로 고정하고 제거 뒤 같은 표본과 비교한다.
- 한 번에 하나만 비활성화 → 관찰 기간 → 제거 순서로 진행한다. 동시에 여러 항목을 제거하지 않는다.
- rollback은 고정 버전 재설치, 백업한 비밀 제외 설정 복원, 훅 재활성화 절차를 대상별로 준비한다.
- inventory·비교 리포트에는 비공개 설정 값, 경로, 계정·외부 객체 ID를 넣지 않는다.
- 보존할 원리는 VHK 계약으로 다시 구현하고, 제거 명령·전역 설정 변경은 실행 직전에 다시 승인받는다.
- OMC는 기본 설치하지 않으며, 비교 실험 필요가 생길 때만 격리해 평가한다.

## 14. 검증 계획

| 영역 | 필수 검사 |
|---|---|
| 스키마 | 필수 필드, 알 수 없는 버전, forward-compatible optional 필드 |
| 상태 | 허용·금지 전이, blocked reason, done 증거, released 승인 |
| 원본·Goal 어댑터 | roadmap·PRD 원본 우선, Goal 없는 clone, 7개 source_status 보존, assurance 분리, 원본 무쓰기 |
| next 호환 | IN_PROGRESS 우선 → 첫 NOT_STARTED 순서 보존, priority가 호환 결과를 바꾸지 않음 |
| 그래프 | 순환, 없는 의존성, canceled/superseded 선택 제외, 병렬 파일 충돌 |
| Context | 관련 정보만 포함, stale revision, unknown 보존, 시크릿 마스킹 |
| 공개 경계 | 모든 직렬화 객체에서 절대경로·시크릿·개인 식별자·실제 외부 ID 저장 거부 |
| 의미 쓰기 | 멱등 재시도, expected_revision 충돌, append-only, 무단 done·delete 거부, rollback reconciliation |
| 승인 | 사람 외 actor 거부, scope·revision·만료·철회, 승인만으로 실행·완료되지 않음 |
| 외부 표면 | 쓰기 실패·오래된 상태·승인 대기를 숨기지 않음 |
| 개선 | baseline 없는 승격 거부, 사람 승인, 악화 시 rollback 가능 |
| 회귀 | 기존 Goal·CLI·MCP·검증 리포트의 동작과 공개 시그니처 불변 |

공통 코드 게이트는 현 2.x 원본을 따른다. Task Spine 구현을 시작하더라도 게이트 실패 상태에서 완료로
전이하지 않는다.

## 15. 현재 2.x 로드맵과의 관계

Task Spine은 현재 2.13~2.19 작업 단위를 밀어내지 않는다.

- 2.13~2.15의 정확성·규칙 집행·권고 영속화는 Task Spine의 선행 신뢰 조건이다.
- 2.16의 계측은 Task·Run·개선 후보의 baseline에 재사용한다.
- 2.17~2.19의 권한·실행·승인 경계는 bounded autonomy 정책에 재사용한다.
- Wave 1 이후 구현은 ADR-012 승인과 최소 2.13 안정성 확인 뒤 별도 작업 단위로 편성한다.
- 현재 로드맵 작업 개수와 릴리스 종료 조건은 이 RFC로 바꾸지 않는다.

## 16. 열린 질문과 질문 순서

아래는 구현 전에 대화로 하나씩 닫아야 한다. 한 번에 전부 묻지 않는다.

1. **물리 원본 형식:** ADR-010의 추적 roadmap·PRD를 유지할지, 별도 ADR로 새 Task 파일 원본을 opt-in 허용할지. Goal은 어느 경우에도 원본 후보가 아님
2. **projection 위치:** 추적 파일, gitignored cache, 메모리 생성 중 무엇이 가장 단순한지
3. **DefinitionPacket 경계:** 제품 문서에 둘지, 별도 짧은 파일로 둘지
4. **외부 쓰기 충돌:** 파일 잠금, expected revision, PR 기반 쓰기 중 첫 구현을 무엇으로 할지
5. **교차 에이전트 트리거:** 각 도구의 실제 지원 기능을 조사한 뒤 수동 fallback을 어디까지 표준으로 둘지
6. **증거 보존:** 로컬 경로·스크린샷·대형 로그를 어떤 참조와 보존 기간으로 관리할지
7. **개선 지표:** 시간, 재작업, 검사 실패, 사용자 개입 중 무엇을 첫 baseline으로 삼을지

첫 질문의 답이 뒤 질문의 선택지를 바꿀 수 있으므로 이 순서를 기본으로 한다. 조사로 답할 수 있는 사실은
공식 문서·코드·실측을 먼저 확인하고, 제품 의도와 되돌리기 비용이 걸린 선택만 관리자에게 묻는다.

## 17. 승인 뒤 첫 티켓 묶음

| 티켓 | 범위 | 완료 조건 |
|---|---|---|
| TS-1 | 스키마 타입·검증기 | 잘못된 상태·필수 필드 누락을 결정론적으로 거부 |
| TS-2 | 추적 원본 + Goal 보조 어댑터 | Goal 없는 clone과 기존 fixture 전량을 원본 수정 없이 투영 |
| TS-3 | DAG 검사기 | 순환·없는 의존성·자동 선택 제외 상태 검출 |
| TS-4 | WorkContext 읽기 | revision·open question·검증 계획을 포함한 최소 문맥 생성 |
| TS-5 | 교차 에이전트 도그푸딩 | 두 실행 표면에서 같은 next와 완료 조건을 읽음 |

TS-1~TS-5는 승인 뒤에도 작은 PR로 나눈다. 쓰기 도구와 외부 관제 화면은 이 묶음의 검증이 끝난 뒤 편성한다.

## 18. 관련

- [ADR-012](../adr/ADR-012-agent-agnostic-core-and-method-absorption.md)
- [ADR-010](../adr/ADR-010-goal-sot-and-public-boundary.md)
- [ADR-009](../adr/ADR-009-vhk-auto-extension-not-new-module.md)
- [RFC 0054](0054-execution-evolution.md)
- [RFC 0057](0057-agent-agnostic-compounding.md)
- [RFC 0063](0063-overnight-vhk-auto.md)
