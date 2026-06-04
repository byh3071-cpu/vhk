---
vhk_format: 1
type: goal
id: 20
title: vhk evolve — Evolution Loop 도미노 4 (패턴→룰 후보→사람 승인→반영)
status: IN_PROGRESS
priority: P1
version: v2.3.0
depends_on:
  - goal-18-memory-schema-v2
  - goal-19-pattern
leads_to: v3-vhk-hub
---

# Goal 20 — vhk evolve

## 목적
patterns[](Goal 19) → rule/check/prompt "후보" 생성 → 사람 승인 → diff + 반영 + undo.
성장 루프 도미노 4번(진화). 18(기억)·19(패턴) 위에 선다.

## 비목적 (v0 제외)
- 자동 적용 금지(1원칙: 자동 학습 OK, 자동 적용 금지)
- 크로스-프로젝트 공유(= v3 VHK Hub)
- ML/LLM 기반 후보 생성(규칙·템플릿 기반만)
- check/prompt 후보, profile.json 연계 → v0.1+

## 설계 결정 (동결)

### CLI (컨테이너 — memory/pattern과 동형)
- `vhk evolve suggest`      # patterns[] → 후보 큐 적재(쓰기=큐만, 본문 반영 X)
- `vhk evolve list`         # --status pending|rejected|applied (approved 상태 없음 — 아래 주석)
- `vhk evolve apply <id>`   # diff 출력 → 사람 TTY 확인(원스텝) → 반영 + .bak
- `vhk evolve reject <id>`  # 기각(archived)
- `vhk evolve undo`         # 최근 apply 1건만 undo(.bak 복원) — id 인자 없음(단일 제약)
- `--json` (suggest/list, CI·MCP용) / alias: `진화` / MCP: suggest·list만 노출
> **apply = 원스텝**: diff 출력 → 사람이 TTY에서 확인/문구 수정 → 즉시 반영. `approved`는
> 별도 상태가 아님(two-step approve→apply 없음). status 값: `pending | rejected | applied`만 유효.

### 후보 저장 (Q1=A + 가드)
- 위치: 별도 `.vhk/evolve/queue.json` (memory v2 스키마 불변)
- 가드1: patterns[]를 복사하지 말고 id로 "참조만"(이중 SoT 금지)
- 가드2: queue는 "기억"이 아니라 "워크플로 상태"임을 문서·게이트에 명시
  (18 금지문구 게이트가 queue.json 오탐 안 하게 예외 처리)

### 반영 타깃 (Q2=A)
- v0는 rule 후보만 → RULES.md append → vhk sync 재생성
- check/prompt는 v0.1+

### 트리거 (Q3=A)
- 수동 `vhk evolve suggest`만. pattern detect 자동 체이닝 안 함.

### 후보 라이프사이클 (그룹 A)
- A1 재제안 억제: reject한 후보는 다음 suggest에서 억제(기각 기억)
- A2 중복 suggest: dedupe 키(패턴id+종류)로 1건 유지
- A3 반영 후 전이: apply 완료 → 큐 항목 status=applied, 소스 패턴 status=archived
  (재제안 차단 — archived는 18의 선순환 status 재사용. 'applied' 신규 status 추가 불필요)
- A4 댕글링 참조 가드: apply 실행 전 참조 패턴 id의 현재 status 확인.
  소스 패턴이 archived이면 archived 원인을 구분해 경고:
  - dismiss로 archived(queue에 applied 항목 없음) → "소스 패턴이 dismiss됨 — apply 거부"
  - A3 apply 완료로 archived(queue에 applied 항목 있음) → "이미 반영된 패턴 — apply 거부"
  어느 경우든 apply 거부. 사용자가 의도하지 않은 중복 반영 방지.
  구현 시 queue.json에서 동일 patternId 기준 applied 항목 존재 여부로 두 경우를 구분.

### rule 문구 (그룹 B)
- B1 템플릿 기반 문구 생성(매직/LLM 금지)
- B2 후보=초안, apply 직전 사람이 문구 수정 가능
- B3 RULES.md 중복 룰 append 전 감지

### 안전·게이트 (그룹 C)
- C1 undo 경계: apply=RULES.md append+sync 2단계 → undo=RULES.md .bak 복원→재sync
  - **apply 대화형 강제**: apply 진입 즉시 `ensureInteractive()` 가드 — 비-TTY(MCP·스크립트)면 에러 종료.
    sync는 apply가 이미 사람 확인을 거친 후 `sync({ yes: true })` 또는 내부 non-interactive 분기로
    호출(sync 자체의 TTY 프롬프트 중복 방지 + 비-TTY 자동 실행 차단). 이중 프롬프트 금지.
  - **undo 대화형 강제 + 재sync 비대화형**: undo도 `ensureInteractive()` 가드 필수(apply와 동일).
    undo 내 RULES.md .bak 복원 후 재sync 호출도 `sync({ yes: true })` 비대화형으로 실행
    (undo 자체가 TTY 확인 후 진행이므로 재sync 이중 프롬프트 불필요·금지).
  - **undo 단일 apply 제약(#2 연동)**: .bak은 파일 단위 롤링 단일 백업이므로 직전 apply 1건만 undo 가능.
    다중 연속 apply 금지 — 2번째 apply 전에 반드시 이전 apply를 undo하거나 유지 결정해야 함.
    구현에서 queue.json에 `appliedAt` + RULES.md 스냅샷 경로를 기록해 per-id 복원 가능하게 할 수도
    있으나 v0는 "최근 apply 1건만 undo" 제약을 테스트·문서에 명시 필수.
- C2 자동적용 금지 게이트: evolve가 AGENTS/CLAUDE 직접 write하는 코드 없는지 grep 게이트
  (evolve.ts 구현 후 게이트가 해당 파일을 스캔하도록 check-goal-20.mjs 업데이트 필수)
- HARD_STOP 체크 / apply·undo는 대화형(MCP·비대화형 차단)

## 수용 기준 (구현 단계 기준, 지금은 문서화만)
- suggest 결정적: 같은 patterns[] → 같은 후보(단위 테스트)
- diff 없이/미승인 반영 시 에러로 차단(테스트)
- undo가 .bak 정확 복원(테스트)
- 자동 적용 경로 코드에 없음(grep 게이트)
- build/test/check-meta + goal check --id 20 통과

## 테스트 계획
- suggest 매핑(avoid→rule 후보) 결정성
- dedupe/재제안 억제
- apply 승인·diff 가드 / undo 복원
- **다중 apply 블로킹**: apply 후 2번째 apply 시도 시 에러 반환 (단일 apply 제약 시행)
- undo → apply 후 재apply 가능 확인(undo로 단일 제약 해제)
- A4 댕글링 가드: dismiss된 패턴 참조 큐 항목 apply 시도 → 거부 확인
- 중복 룰 감지

## 의존·후속
- ⬅ Goal 19 patterns[] 포맷 = 입력 계약(19 안정화 후 구현)
- ➡ Goal 20까지 = 프로젝트별 v2 루프 완성 → 위층 v3 VHK Hub

## Mandatory Reading
- goals/19-pattern.md (PatternEntryV19 스키마 · patterns[] 포맷 · avoid/reinforce)
- src/commands/pattern.ts (PatternEntryV19 런타임 타입)
- goals/18-memory-schema-v2.md (status 선순환 · loadForMutation 계약)
- RULES.md (반영 타깃 파일 구조 확인)
