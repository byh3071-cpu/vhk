---
rfc: 0064
title: Agent-agnostic read-only work projection
status: Proposed
created: 2026-07-31
updated: 2026-08-02
relates: ADR-012, ADR-010, RFC-0057
---

# RFC 0064 — 에이전트 비종속 작업 실행 계약: 읽기 전용 v0

> 내부명: Task Spine. 사람에게는 **작업 실행 계약**이라고 설명한다.
>
> 상태: **Proposed — ADR-012는 Accepted, 115~118 구현·공통 게이트와 열린 질문 2건의 결정은 완료했다.**
> **#552의 main 머지와 후속 CI는 완료됐다. PR B 구현 승인은 별도 사람 게이트로 남는다.**
> 이 문서는 현재 Goal을 바꾸지 않고 읽는 첫 단계만 제안한다.

## 0. 가장 짧은 설명

같은 프로젝트를 Claude Code, Codex, Cursor 중 무엇으로 열어도 다음 세 가지를 같은 구조로 읽게 한다.

1. 무엇을 만들고 있는가?
2. 현재 이어서 볼 한 작업은 무엇인가?
3. 완료라고 말하기 전에 무엇을 확인해야 하는가?

첫 단계는 조회만 한다. 새 Task 저장소, 쓰기 API, 의존성 스케줄러와 관제 화면은 만들지 않는다.

## 1. 목표와 비목표

### 목표

- ADR-010의 roadmap·PRD와 기존 Goal을 원본 수정 없이 읽는다.
- Goal 상태를 보수적으로 `ProjectedTask`에 투영한다.
- 현재 에이전트에 필요한 최소 문맥을 `WorkContext` JSON으로 표현한다.
- 기존 `selectActiveId` 선택 순서를 그대로 보존한다.
- 증거가 Task에 연결되지 않은 legacy DONE을 canonical done으로 표시하지 않는다.
- 공개 JSON은 현재 VHK 관례인 camelCase와 숫자 `schemaVersion`을 따른다.

### 비목표

- 기존 Goal, CLI 인자, MCP 도구와 `.vhk` 파일 형식을 교체하는 것
- Task 전용 원본 파일·DB 또는 상태 쓰기를 만드는 것
- 부모·자식, 의존성 그래프, 우선순위 스케줄러를 만드는 것
- 새 Evidence, Receipt, Run, Approval 스키마를 만드는 것
- `get_next_tasks` 같은 새 MCP를 추가하는 것
- Control Tower, 원격 MCP, Brain, Inbox, Calendar를 구현하는 것
- 플러그인을 설치·비활성화·제거하는 것

이 비목표들은 버리지 않는다. [미래 설계 지도](../reference/agent-agnostic-future-map.md)에 전제 조건과
함께 보존한다.

## 2. 활성화 경계

아이디어, 링크 수집, 리서치와 자유 대화인 DISCOVER는 VHK 실행 루프 밖에 둔다. 실제로 만들기로
결정한 뒤 DEFINE에서 문제, 범위, 성공 조건과 높은 영향의 회색 영역을 정리한다.

```text
DISCOVER(외부) → 만들기로 결정 → DEFINE → EXECUTE → VERIFY
```

DEFINE에서는 [Definition Packet 템플릿](../reference/definition-packet-template.md)을 사람용 Markdown으로
사용할 수 있다. 이 RFC는 그 템플릿의 파서, 타입 또는 저장 위치를 만들지 않는다.

### 대화로 회색 영역을 닫는 규칙

1. AI가 이해한 내용을 5줄 이하로 다시 말한다.
2. 구현 방향을 가장 크게 바꾸는 질문 하나만 묻는다.
3. 선택지 2~3개와 추천안·이유를 제시한다.
4. 답을 결정 또는 되돌릴 수 있는 가정으로 기록한다.
5. 높은 영향의 열린 질문이 0개가 될 때까지 반복한다.
6. 마지막에 쉬운 요약과 상세 Definition Packet을 함께 출력한다.

조사로 확인할 수 있는 사실은 공식 문서·코드·실측으로 먼저 확인한다. 제품 의도와 되돌리기 비용이
걸린 선택만 사람에게 묻는다.

## 3. 현재 원본 소유권

| 정보 | 원본 또는 권위 | v0에서의 사용 |
|---|---|---|
| 2.x 작업 정의·순서 | `docs/roadmap/2.x-roadmap.md` | 읽기 |
| 2.x 수용 기준 | `docs/PRD-2.x.md` | 읽기 |
| 로컬 Goal 실행 상태 | 존재할 때 `goals/*.md` frontmatter | 읽기 |
| 다음 작업 스냅샷 | `docs/state/next-task.md` | 원본으로 사용하지 않음 |
| 생성 맥락 | `.vhk/context.md` | 원본으로 사용하지 않음 |
| 차단 이력 | `docs/state/blockers.md` | 최근 로컬 차단 정보 읽기 |
| 검증 | 기존 VerifyReport, Receipt, ledger | 구조 재사용, Task 바인딩은 하지 않음 |

불변식:

```text
roadmap·PRD        = 추적 작업 정의와 수용 기준
Goal frontmatter  = 비추적 로컬 실행 상태
context·next-task = 재생성 가능한 스냅샷
ProjectedTask     = 메모리에서 만든 읽기 전용 뷰
```

v0는 roadmap, PRD, Goal, context, next-task, blocker, receipt와 ledger에 쓰지 않는다.

## 4. 직렬화 규칙

“읽기 기능 v0”와 “JSON 스키마 버전 1”은 다른 개념이다.

- 기능 단계 이름: read-only v0
- JSON 필드: `schemaVersion: 1`
- 필드명: camelCase
- 날짜가 필요할 때: ISO 8601 문자열
- 파일 참조: 저장소 상대경로만
- 로컬 절대경로, 시크릿, 개인 이메일·실명, 실제 외부 서비스 객체 ID: 출력 금지
- 알 수 없는 값: 추측하지 않고 `null`, 빈 배열 또는 warning으로 표시

현재 `Receipt`, `VerifyReport`, `MemoryFileV2`의 관례와 맞추기 위해 snake_case나
`schema_version: Type.v0` 형태를 새로 만들지 않는다.

## 5. ProjectedTask 계약

`ProjectedTask`는 영구 Task가 아니다. 기존 정의와 Goal 상태를 한 에이전트 턴에서 읽기 쉽게 만든
메모리 내 read model이다.

```json
{
  "schemaVersion": 1,
  "id": "115",
  "title": "규칙 파서 오독 수정",
  "status": "inProgress",
  "sourceStatus": "IN_PROGRESS",
  "sourceRefs": [
    "docs/roadmap/2.x-roadmap.md",
    "docs/PRD-2.x.md",
    "goals/115-rules-parser.md"
  ],
  "acceptanceCriteria": [],
  "assurance": "unverified",
  "warnings": []
}
```

### 5.1 필드

| 필드 | 형식 | 의미 |
|---|---|---|
| `schemaVersion` | `1` | 공개 JSON 스키마 버전 |
| `id` | string | legacy Goal id를 문자열로 보존 |
| `title` | string | Goal 제목, 없으면 명시적 대체 문구와 warning |
| `status` | ProjectedStatus | 보수적으로 해석한 읽기 상태 |
| `sourceStatus` | GoalStatus 또는 `null` | 원래 Goal 상태를 손실 없이 보존 |
| `sourceRefs` | string[] | 저장소 상대경로 출처 |
| `acceptanceCriteria` | string[] | roadmap·PRD에서 결정론적으로 연결한 기준만 포함, 연결 실패 시 빈 배열 + warning (Goal 본문 fallback 금지) |
| `assurance` | Assurance | Task별 완료 증거의 확인 가능 수준 |
| `warnings` | string[] | 누락·불확실성·보수적 변환 이유 |

`ProjectedStatus`:

```text
defined | inProgress | verification | blocked | canceled | deferred | observing | unknown
```

`Assurance`:

```text
unknown | unverified | missingEvidence
```

v0에는 `done`, `released`, `ready`, `verified`가 없다.

- Task별 증거 연결이 없으므로 done·verified를 정직하게 증명할 수 없다.
- 의존성·승인·범위 계약이 없으므로 ready를 계산할 수 없다.
- release는 현재 Goal 투영의 책임이 아니다.

### 5.2 legacy Goal 상태 매핑

| Goal `sourceStatus` | `ProjectedTask.status` | `assurance` | 이유 |
|---|---|---|---|
| `NOT_STARTED` | `defined` | `unknown` | 정의는 있으나 실행 가능성은 계산하지 않음 |
| `IN_PROGRESS` | `inProgress` | `unverified` | 진행 상태만 보존 |
| `DONE` | `verification` | `missingEvidence` | 기존 증거에 Task id 바인딩이 없어 canonical done 금지 |
| `BLOCKED` | `blocked` | `unverified` | 차단 이유가 없으면 warning |
| `CANCELED` | `canceled` | `unverified` | 결정 근거가 없으면 warning |
| `DEFERRED` | `deferred` | `unverified` | 재개 조건이 없으면 warning |
| `OBSERVING` | `observing` | `unverified` | 관찰 조건이 없으면 warning |
| 누락·비표준 | `unknown` | `unknown` | 추측 금지 |

중요:

- `DONE → verification`은 원래 상태를 부정하거나 Goal을 역수정하는 동작이 아니다.
- `sourceStatus: "DONE"`을 그대로 남기면서, 현재 읽기 계약이 증명할 수 있는 수준만 표시한다.
- 기존 저장소 수준 Receipt가 pass여도 어느 Task의 증거인지 연결할 계약이 없으므로 v0에서 done으로
  승격하지 않는다.

## 6. 기존 next 선택 호환

v0는 새 스케줄러를 만들지 않고 현재 `selectActiveId` 순서만 보존한다.

1. id 오름차순 Goal 중 첫 `IN_PROGRESS`
2. 없으면 첫 `NOT_STARTED` 또는 상태가 누락된 legacy Goal
3. 둘 다 없으면 active task는 `null`

`BLOCKED`, `DONE`, `CANCELED`, `DEFERRED`, `OBSERVING`은 자동 선택하지 않는다. 상태 누락 Goal을
선택하는 것은 기존 호환 동작이며 투영 상태는 `unknown`으로 유지한다. priority, dependency, 부모·자식
정보는 v0 선택에 사용하지 않는다.

따라서 v0는 `get_next_tasks`가 아니라 **현재 호환 active task 하나**만 제공한다.

## 7. WorkContext 계약

`WorkContext`는 ProjectedTask와 현재 작업에 필요한 최소 문맥을 묶는 읽기 전용 JSON이다.

```json
{
  "schemaVersion": 1,
  "project": {
    "name": "@byh3071/vhk",
    "goal": "모델·에이전트를 뭘로 바꿔도 안 무너지는 풀사이클 AI 코딩 하네스. (README·README.en 헤드라인과 동일)",
    "sourceRefs": [
      "package.json",
      "VISION.md"
    ]
  },
  "activeTask": null,
  "blockers": [],
  "verificationPlan": [
    "pnpm typecheck",
    "pnpm lint",
    "pnpm test:run",
    "pnpm build",
    "pnpm boundary:check"
  ],
  "warnings": [
    "로컬 Goal 카드가 없어 실행 상태를 투영하지 못했습니다."
  ],
  "sourceRevision": "sample-git-sha"
}
```

### 7.1 필드와 결정 규칙

| 필드 | 형식 | 결정 규칙 |
|---|---|---|
| `schemaVersion` | `1` | 공개 JSON 스키마 버전 |
| `project.name` | string 또는 `null` | `package.json`의 `name`, 파일·값이 없으면 `null`과 warning |
| `project.goal` | string 또는 `null` | `VISION.md`의 정확한 `## What (한 줄)` 아래 첫 유효 문장, 없거나 미작성 마커면 `null`과 warning |
| `project.sourceRefs` | string[] | `name`·`goal` 값을 실제로 읽은 파일만 고정 필드 순서로 포함 |
| `activeTask` | ProjectedTask 또는 `null` | §6의 기존 선택 순서로 고른 한 Goal을 투영, 선택할 Goal이 없으면 `null` |
| `blockers` | string[] | 기존 `getActiveBlockers(3)` 결과를 파일 순서대로 사용, 파일이 없으면 빈 배열 |
| `verificationPlan` | string[] | `package.json`에 실제 존재하는 script만 `typecheck` → `lint` → `test:run` → `build` → `boundary:check` 순서로 명령화 |
| `warnings` | string[] | 필드 생산 순서대로 추가하고 완전히 같은 문자열만 중복 제거 |
| `sourceRevision` | string 또는 `null` | 가능한 경우 Git HEAD SHA, Git 저장소가 아니거나 조회 실패면 `null`과 warning |

필드 생산 순서는 `project` → `activeTask` → `blockers` → `verificationPlan` → `sourceRevision`이다.
따라서 같은 파일 상태는 같은 배열 순서와 JSON 의미를 만든다. `constraints`, `decisions`,
`openQuestions`처럼 출처·선별 규칙이 없는 배열은 v0에 넣지 않는다.

`project.goal`은 다음 순서로만 결정한다.

1. 대소문자와 문구가 정확히 `## What (한 줄)`인 level-2 heading을 찾는다.
2. 다음 level-2 heading 전까지 첫 non-empty line 하나를 읽는다.
3. 그 줄이 `<...>` 미작성 마커이거나 heading·목록·인용·코드 펜스이면 값으로 채택하지 않는다.
4. 유효한 문장이 없으면 `goal: null`과 warning을 반환한다. `Why`, PRD 또는 다른 문장으로 추측 대체하지 않는다.

실제 값을 채택한 경우에만 `project.sourceRefs`에 `VISION.md`를 포함한다.

### 7.2 포함 원칙

- 프로젝트 전체 문서를 복사하지 않고 현재 실행에 필요한 요약과 출처만 넣는다.
- 결정과 근거, 열린 질문은 결정론적 선택 계약이 생기기 전까지 JSON에 넣지 않는다.
- 선택형 정보가 없으면 `null` 또는 빈 배열과 필요한 warning으로 표시한다.
- 파일 참조는 저장소 상대경로만 사용한다.
- 기존 Receipt·Run·원장의 새 복사본을 넣지 않는다.

### 7.3 CLI 표면 제안

ADR 승인 뒤 별도 코드 PR에서 기존 명령에 additive flag 하나만 추가한다.

```text
vhk context --json
```

- JSON만 stdout에 출력한다.
- `.vhk/context.md`를 포함해 어떤 파일도 만들거나 수정하지 않는다.
- 사람용 헤더, spinner와 다음 단계 문구를 JSON stdout에 섞지 않는다.
- 기존 `vhk context`와 `vhk context --compact` 동작은 그대로 유지한다.
- v0에서는 MCP 도구를 추가하지 않는다.

명령을 새로 만들지 않고 기존 context의 읽기 표면으로 넣는 이유는 사용자 진입점을 늘리지 않기 위해서다.

## 8. 기존 검증·실행 구조와의 관계

v0는 아래 기존 구조를 새 이름으로 복제하지 않는다.

- `VerifyReport`
- `Receipt`와 `ReceiptEvidence`
- evidence ledger와 receipt log
- autonomy log와 action ledger

이들은 현재 저장소 또는 실행 단위의 기록이다. Task별 증거·Run 연결이 필요해지면 “어떤 기존
레코드를 권위로 삼고 Task id를 어디에 결합할지”를 별도 ADR에서 결정한다.

## 9. 구현 전제와 PR 경계

### PR A — 이 문서 묶음

- ADR-012를 Accepted로 기록하고 RFC 0064는 Proposed로 검토
- RULES, context/work 프롬프트와 ARCHITECTURE의 원본 경계 정렬
- 미래 설계 지도와 사람용 Definition Packet 템플릿
- 코드 계약 구현 없음

### PR B — 별도 승인 뒤 읽기 전용 코드

다음 조건을 모두 충족한 뒤 시작한다.

1. ADR-012가 실제 파일에서 Accepted (`2026-08-01` 충족)
2. 2.13 작업 115, 116, 117, 118 완료 (`#552` 구현·검토·main 머지·후속 CI 완료, 2026-08-02)
3. 공통 게이트 통과 (`#552` 충족)

이 문서의 설계 전제와 선행 main 반영은 준비됐지만, PR B 구현은 별도 Plan 승인 뒤 시작한다.

PR B 범위:

- `ProjectedTask`와 `WorkContext` 타입·검증
- legacy Goal 읽기 전용 투영
- `vhk context --json`
- 기존 active Goal 선택 순서 golden test
- 원본 무쓰기 회귀 테스트

PR B 제외:

- 새 MCP
- Task 쓰기·영구 저장
- dependency scheduler
- Task별 Evidence·Run
- Approval
- 외부 DB·관제 화면

## 10. 검증 계획

| 영역 | 필수 검증 |
|---|---|
| 직렬화 | `schemaVersion: 1`, camelCase, 필수 필드와 unknown 처리 |
| 상태 | 7개 Goal 상태 + 누락 상태의 보수적 매핑 |
| 거짓 완료 | legacy DONE이 `verification + missingEvidence`, canonical done 부재 |
| 선택 호환 | 첫 IN_PROGRESS, 없으면 첫 NOT_STARTED, 나머지 제외 |
| 무쓰기 | roadmap, PRD, goals, `.vhk`, `docs/state`의 내용·mtime 불변 |
| 출력 | JSON stdout에 사람용 로그가 섞이지 않음 |
| 공개 경계 | 절대경로·시크릿·개인 식별자·실제 외부 객체 ID 미포함 |
| 회귀 | 기존 context, Goal, CLI, MCP, Receipt 동작과 공개 시그니처 불변 |
| 교차 에이전트 | 같은 fixture에서 두 실행 표면의 핵심 JSON 동일 |

검증이 실패하면 구현 상태를 완료로 표시하지 않는다.

## 11. 결정 기록 — 열린 질문 닫힘

2026-08-01 사용자 대화 승인으로 PR B 전 열린 질문 2건을 닫았다.

### 11.1 acceptance criteria 연결 실패

- **결정:** roadmap·PRD에서 기준을 결정론적으로 연결하지 못하면 `acceptanceCriteria: []`와 warning을
  반환한다. Goal 본문은 대체 원본이나 파생 cache로 읽지 않는다.
- **이유:** 정보량보다 원본 정직성과 재현성을 우선한다. Goal 본문을 읽으면 비추적 실행 상태가 제품
  수용 기준의 두 번째 원본처럼 굳을 수 있다.
- **기각:** Goal 본문 fallback은 더 풍부하지만 오래되거나 roadmap·PRD와 어긋난 기준을 사실처럼
  노출할 위험 때문에 v0에서 제외한다.

### 11.2 project.goal 출처

- **결정:** `VISION.md`의 정확한 `## What (한 줄)` 아래 첫 유효 문장만 사용한다. 없거나 미작성
  마커면 `goal: null`과 warning을 반환한다.
- **이유:** VHK 템플릿과 기존 content·launch·ops·sell 흐름이 이미 같은 위치를 사용하므로 새 원본이나
  해석 규칙을 만들지 않는다.
- **기각:** `Why` 첫 문장은 여러 줄 해석이 필요하고, 항상 `null`은 결정 가능한 프로젝트 목표까지
  버리므로 선택하지 않는다.

그 밖의 저장, 쓰기, 승인, 관제, 병렬과 진화 질문은 미래 설계 지도에서 각 전제 조건이 갖춰질 때 연다.

## 12. 관련

- [ADR-012](../adr/ADR-012-agent-agnostic-core-and-method-absorption.md)
- [ADR-010](../adr/ADR-010-goal-sot-and-public-boundary.md)
- [ADR-011](../adr/ADR-011-terminology.md)
- [RFC 0057](0057-agent-agnostic-compounding.md)
- [미래 설계 지도](../reference/agent-agnostic-future-map.md)
- [Definition Packet 템플릿](../reference/definition-packet-template.md)
