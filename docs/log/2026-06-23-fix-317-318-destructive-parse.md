# 2026-06-23 — fix #317·#318 파괴적 입력 검증 (부분파싱/강제변환)

## 한 일
- #317 `goal check/done --id`: `Number('')===0`·`Number(' 1')===1` 강제변환이 빈/공백/소수/앞뒤공백 `--id`를 통과시켜 엉뚱한 goal(특히 goal 0)을 조용히 DONE 처리하던 데이터 오염 차단.
  - `src/commands/goal.ts resolveGoalId`: 엄격 정수 정규식 `/^\d+$/`(앞뒤 공백조차 거부)로 검증, 거부 시 sentinel 반환 → 호출부(goalCheck·goalDone) 둘 다 친절 메시지(`ko.goal.invalidId`)로 exit 1.
- #318 `memory remove/archive`: `parseInt('2zzz',10)=2`·`parseInt('1.5',10)=1` 부분파싱이 NaN 검사를 통과해 범위 안이면 엉뚱한 항목을 조용히 삭제/보관하던 파괴적 버그 차단.
  - `src/commands/memory.ts resolveIndex`: `/^\d+$/` + `Number.isInteger` 엄격 검증. remove·archive 공용 경로라 둘 다 가드됨.

## 검증 (TDD)
- goal.test.ts: #317 describe 추가(빈·공백·`' 1'`·문자·소수·음수 거부 + 정상 `'1'` 회귀 + goalCheck 차단) → red→green.
- memory.test.ts: #318 describe 추가(remove·archive 각각 `'2zzz'`·`'1.5'`·`' 2'`·빈·문자·음수 거부, 삭제/보관 0 + exit 1, 정상 정수 회귀) → red→green.

## 남은 위험
- 강제변환 거부 정책을 raw 문자열 기준(`' 1'` 거부)으로 통일 — trim 후 허용이 더 관대하나, 수용 기준이 `' 1'` 거부를 명시해 raw 검증 채택. CLI UX상 사용자가 공백 포함 입력할 일은 드묾.
