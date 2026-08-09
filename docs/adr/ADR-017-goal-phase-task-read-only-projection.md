---
id: ADR-017
date: 2026-08-09
status: accepted
tags: [goal, phase, task, context, read-only]
---

# ADR-017: Goal 본문의 Phase와 Task를 읽기 전용 작업 그래프로 투영

## 맥락 (Context)

VHK의 Goal은 작업 단위와 로컬 실행 상태를 보존하지만, 한 Goal 안에서 실제로 이어서 할 일을
기계가 읽을 계약은 없다. 도그푸딩 프로젝트는 Goal 본문에 `### Phase N`과
`- [ ] **Task N**` 체크리스트를 두고 사용한다. 사람에게는 충분하지만 실행 표면마다 Phase 순서,
Task 상태와 준비 여부를 다시 해석하면 같은 입력에서 다른 다음 행동이 나올 수 있다.

기존 RFC 0064는 Goal 하나를 `ProjectedTask` 하나로 바꾸고 roadmap·PRD에서 수용 기준을 결합하는
더 넓은 문맥을 제안했다. 실제 요구는 그보다 작다. Goal Markdown을 그대로 두고 본문에 이미 있는
Phase와 Task만 읽으며, 직전 Phase가 끝났는지로 준비 여부를 계산하면 된다.

## 결정 (Decision)

### 1. 원본은 바꾸지 않는다

- 제품 작업 정의와 수용 기준의 원본은 ADR-010에 따라 roadmap·PRD다.
- `goals/*.md`는 로컬 Goal 실행 상태와 그 Goal 내부의 Phase/Task 분해를 보존한다.
- Phase/Task 투영은 메모리와 표준 출력에서만 만들고 어떤 원본이나 상태 파일에도 쓰지 않는다.
- Phase/Task 체크박스를 바꾸는 명령과 별도 Task 저장소는 만들지 않는다.

Goal 본문의 Phase/Task는 제품 작업 정의를 대체하지 않는다. 한 Goal을 실행 가능한 크기로 나눈
로컬 구조이며, Goal 완료 판정과 기존 검사 스크립트의 권위도 그대로 유지한다.

### 2. 작은 Markdown 문법만 계약한다

- Phase는 코드 펜스 밖의 정확한 level-3 heading `### Phase N`이다.
- Task는 해당 Phase 아래의 정확한 체크리스트 `- [ ] **Task N** 설명` 또는
  `- [x] **Task N** 설명`이다. 대문자 `X`도 완료로 읽는다.
- Phase 번호와 Goal 전체의 Task 번호는 각각 양수·고유·오름차순이어야 한다. 결번은 허용한다.
- Task는 하나의 Phase에 속하고 Phase마다 Task가 하나 이상 있어야 한다.
- 코드 펜스 안의 예시는 구조로 읽지 않는다.
- Task 라벨 직후의 정확한 backticked `` `(na)` `` 토큰은 `notApplicable` 상태다. 완료 checkbox와
  `` `(na)` ``를 함께 쓰면 구조 오류다.
- `/ 증거:` 또는 `/ evidence:` 뒤의 비어 있지 않은 문자열은 선택적 evidence hint로만 읽는다.
  완료 증거로 판정하지 않는다.

Task의 `sourceStatus`는 `pending`, `completed`, `notApplicable` 중 하나다. checkbox와 `` `(na)` ``
토큰만 상태 원본이고 Phase 요약 표나 설명 문장은 상태로 읽지 않는다.

### 3. 준비 여부는 직전 Phase만으로 계산한다

- `completed`와 `notApplicable`은 terminal이다. 두 상태의 `readiness`는 `terminal`이다.
- 첫 Phase의 `pending` Task는 `ready`다.
- 이후 Phase의 `pending` Task는 직전 Phase의 모든 Task가 terminal일 때만 `ready`이고, 그 전에는
  `waiting`이다.
- 첫 Phase Task와 같은 Phase의 Task는 `dependsOn: []`다.
- 다음 Phase의 각 Task는 직전 Phase의 모든 string Task ID를 오름차순 `dependsOn`으로 가진다.

이 의존성은 Phase 장벽의 읽기 전용 투영이다. Goal Markdown에 명시적 Task 의존성 문법을 추가하지
않으며 같은 Phase Task끼리는 서로를 막지 않는다. 우선순위, 병렬 수와 다음 Task 자동 선택도 이
결정에 포함하지 않는다.

### 4. 읽기 표면은 기존 context 명령의 additive JSON이다

`vhk context --json`은 `WorkContextV1` JSON 하나만 stdout에 출력한다. 기존 Goal 선택기가 고른 Goal을
읽으며, 기존 사람용 `vhk context`, Goal 명령과 MCP 계약은 바꾸지 않는다. `WorkContextV1`은
`schemaVersion`, `valid`, `activeGoal`, `warnings`, `errors`를 가진다. `activeGoal` 아래에는 Phase
목록과 평탄한 Task 목록을 각각 `phases`, `tasks`로 둔다.

각 Task는 `id`, `phaseId`, `sourceStatus`, `readiness`, `dependsOn`, `evidenceHint`, `sourceRef`,
`sourceLine`을 가진다. Phase ID는 `goal:N/phase:N`, Task ID는 `goal:N/task:N` string이며
`phaseId`와 `dependsOn`도 같은 string ID를 사용한다.
`sourceRef`는 Goal source root 기준 상대경로이며 절대경로, `..`와 Goal source root 접두사를 넣지
않는다. `sourceLine`은 BOM을 제거하고 CRLF를 정규화해도 원문과 같은 1-based 줄 번호다.

JSON 실행은 Goal과 로컬 상태 파일을 포함해 어떤 파일도 만들거나 수정하지 않는다.

Phase가 없는 기존 Goal은 성공으로 끝내고 `activeGoal.phases: []`, `activeGoal.tasks: []`와 안정적인
warning code를 반환한다. 구조가 잘못된 Goal은 `valid: false`인 안전한 JSON 오류를 출력하고 exit 1로
끝낸다. 빈 Phase, Phase 밖 Task, 잘못된 양수, 중복과 역순, 완료 checkbox와 `` `(na)` `` 조합,
닫히지 않은 fence는 구조 오류다.
파일 시작의 UTF-8 BOM과 CRLF는 정상 입력으로 받아들인다. `--compact --json` 조합도 원문 없는 JSON
오류와 exit 1로 끝낸다.

### 5. 공개 경계 위반은 원문 없이 차단한다

Goal에서 읽은 문자열은 JSON 직렬화 전에 공개 경계 검사를 통과해야 한다. 시크릿, 홈 절대경로,
개인 이메일, 개인 저장소 이름이나 실제 외부 서비스 객체 ID가 감지되면 Goal과 Phase/Task 내용을
출력하지 않는다. stdout에는 안정적인 오류 코드와 필요하면 줄 번호만 남기고, stdout과 stderr 어느
쪽에도 입력 원문이나 입력 경로를 복사하지 않는다.

정상 JSON의 `sourceRef`는 안전한 상대 참조만 허용하고 로컬 절대경로, 현재 시각과 실행 표면
식별자는 넣지 않는다. 같은 Goal 내용은 실행 위치와 실행 표면이 달라도 같은 의미의 JSON을 만들어야
한다.

## 대안 (Alternatives)

| 안 | 판단 |
|---|---|
| Goal 하나를 Task 하나로 투영 | 실제 Goal 내부 작업을 다시 쪼갤 수 없고 기존 RFC 0064의 범위가 넓어 기각 |
| Phase/Task를 새 파일이나 DB에 저장 | Goal 본문과 이중 원본이 생기고 읽기 전용 요구를 넘어서 기각 |
| 모든 Markdown heading과 checklist를 휴리스틱으로 해석 | 설명 문서와 예제를 작업으로 오인하므로 기각 |
| Task 번호 순서대로 직렬 의존성 부여 | 같은 Phase 안에서 독립 실행 가능한 Task까지 막으므로 기각 |
| **명시 문법 + 직전 Phase의 모든 terminal Task 장벽 + 읽기 전용 JSON** | 채택 |

## 결과 (Consequences)

### 장점

- 기존 Goal을 그대로 두고 실행 표면이 같은 Phase/Task 상태와 준비 여부를 읽는다.
- 직전 Phase Task 전체를 의존성으로 노출해 Phase 경계를 넘는 오선택은 막되 같은 Phase 안의 독립
  작업은 제한하지 않는다.
- 구조 오류와 공개 경계 위반에서도 기계가 읽을 수 있는 JSON 계약이 유지된다.
- Phase가 없는 기존 Goal과 기존 사람용·MCP 사용자는 영향을 받지 않는다.

### 비용과 위험

- Markdown 문법이 정확해야 하며 자유 형식 체크리스트는 Task로 읽히지 않는다.
- evidence hint는 안내일 뿐 증거의 존재·유효성·완료를 증명하지 않는다.
- Task 상태 쓰기와 Task별 증거 연결이 없어 완료 갱신은 계속 사람이 Goal 원본에서 수행한다.

### 되돌리기

JSON flag와 읽기 전용 파서를 제거하면 기존 Goal 흐름으로 돌아간다. 원본을 쓰지 않으므로 데이터
마이그레이션이나 역변환이 필요 없다.

## 관련

- [ADR-010](ADR-010-goal-sot-and-public-boundary.md) — 제품 작업 원본과 공개 경계
- [ADR-012](ADR-012-agent-agnostic-core-and-method-absorption.md) — 실행 표면과 무관한 읽기 전용 시작점
- [RFC 0065](../rfc/0065-goal-phase-task-projection.md) — 필드·오류·검증 계약
- [RFC 0064](../rfc/0064-agent-agnostic-task-spine.md) — 이 결정으로 대체된 이전 제안
