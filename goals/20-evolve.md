---
vhk_format: 1
type: goal
id: 20
title: vhk evolve — Evolution Loop 도미노 4 (패턴→룰 후보→사람 승인→반영)
status: NOT_STARTED
priority: P1
version: v2.2.0
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
- `vhk evolve list`         # --status pending|approved|rejected|applied
- `vhk evolve apply <id>`   # diff 출력 → 사람 확인 → 반영 + .bak
- `vhk evolve reject <id>`  # 기각(archive)
- `vhk evolve undo <id>`    # 마지막 반영 되돌리기(.bak 복원)
- `--json` (suggest/list, CI·MCP용) / alias: `진화` / MCP: suggest·list만 노출

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
- A3 반영 후 전이: apply된 패턴 status=applied/resolved(재제안 차단, 18 status 재사용)

### rule 문구 (그룹 B)
- B1 템플릿 기반 문구 생성(매직/LLM 금지)
- B2 후보=초안, apply 직전 사람이 문구 수정 가능
- B3 RULES.md 중복 룰 append 전 감지

### 안전·게이트 (그룹 C)
- C1 undo 경계: apply=RULES.md append+sync 2단계 → undo=RULES.md .bak 복원→재sync
- C2 자동적용 금지 게이트: evolve가 AGENTS/CLAUDE 직접 write하는 코드 없는지 grep 게이트
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
- 중복 룰 감지

## 의존·후속
- ⬅ Goal 19 patterns[] 포맷 = 입력 계약(19 안정화 후 구현)
- ➡ Goal 20까지 = 프로젝트별 v2 루프 완성 → 위층 v3 VHK Hub

## Mandatory Reading
- goals/19-pattern.md (PatternEntryV19 스키마 · patterns[] 포맷 · avoid/reinforce)
- src/commands/pattern.ts (PatternEntryV19 런타임 타입)
- goals/18-memory-schema-v2.md (status 선순환 · loadForMutation 계약)
- RULES.md (반영 타깃 파일 구조 확인)
