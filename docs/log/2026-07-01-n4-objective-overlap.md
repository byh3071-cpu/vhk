# 2026-07-01 — N4 objective 토큰 교집합 (ⓑ 복리 척추)

## 무엇·왜
- ⓑ: intent 의미검증 미완 갭. **LLM 결정경로 영구 배제** 전제 하에, mission.objective ↔ (active goal.title + 최근 commit) **결정론 토큰 교집합**을 receipt advisory 신호로. "목표와 실제 작업 어휘가 안 겹침"을 약신호로 조기 포착 → 북극성(의도대로 검증) 기여.

## 구현 (GA-동결 receipt 결정로직 — 옵셔널 추가만)
- `lib/receipt.ts`: `ReceiptIntentEvidence.objectiveTokenOverlap?: number` 추가. `decideReceipt`에 `objectiveMismatch = intentKnown && overlap === 0` → **caution 분기만**(block 절대 금지). `=== 0` 이라 undefined(미계산) 무영향 = 하위호환·단조성 불변식 ③ 보존. `receiptReasons`에 advisory 1줄.
- `commands/receipt.ts`: `computeObjectiveOverlap(objective, ref)` 순수(pattern.tokenize 재사용, LLM 0) · `isRealObjective`(placeholder/빈값 = 암묵 opt-out) · `collectObjectiveRef`(goal.frontmatter.title + `git log -1 --format=%s`, 읽기전용·실패무해). collectIntent가 실제 objective일 때만 계산.
- **opt-in**: 별도 플래그 대신 "실제 objective 를 mission set 으로 채우면 검증"(placeholder면 undefined=영향0). 노이즈 caution 최소화.

## 검증
- TDD: objective-overlap.test.ts(computeObjectiveOverlap 5·isRealObjective 3) + receipt.test.ts decideReceipt overlap 3케이스(0→caution·>0→pass·undefined→pass, block 절대 안 함).
- 전체 2133 green · typecheck 무에러. **단조성 불변식**: overlap 0 은 caution 이 상한(다른 실차단 없으면 block 불가).

## 다음
- N5 evolve digest(ⓓ) — 복리 척추 마지막(사용자 요청분).
