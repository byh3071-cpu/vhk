# 2026-06-23 — fix #322·#323·#324 memory eval/recall 버그 클러스터

## 한 일 (도그푸딩 자동 버그수색 3건, TDD)

- **#322** `memory eval` 라벨의 `expectIds`가 배열 아닌 문자열이면 `scoreEval`의 `expectIds.includes(id)`가 `String.includes`(부분일치)로 갈려 실제 id를 부분문자열로만 포함해도(`'XYZd1'.includes('d1')`) 거짓 100% Recall@5/MRR 1.00으로 통과 → Kill-gate(RFC 0049 ③·ML 도입 결정) 조용히 오염.
  - `src/lib/recall-eval.ts`: `validateEvalLabels(raw)` 추가 — `expectIds`를 비어있지 않은 string 배열로 강제(문자열 금지), 원소 타입까지 검증. 배열만 통과하므로 `scoreEval`은 항상 `Array.includes`(정확매칭).
- **#323** 평가셋이 구조적 형식 불량(`labels` 비배열·라벨에 `query`/`expectIds` 누락)이면 깨진 JSON과 달리 친절 메시지 없이 raw JS 에러(`labels.map is not a function`·`Cannot read ... toLowerCase/includes`) 노출.
  - `src/lib/recall-eval.ts`: 전용 `EvalFormatError` + `validateEvalLabels`가 구조 불량을 던짐. `labels` 누락(undefined)·빈 배열은 '빈 평가셋'으로 정상 취급.
  - `src/commands/memory-eval.ts`: `readJsonFile<unknown>` → `validateEvalLabels` 통과. 파싱 실패(깨진 JSON)와 `EvalFormatError`(구조 불량)를 동일 친절 메시지 분기로 흡수 + 형식오류 상세 안내 + `--init` 재생성 가이드. 내부 스택 미노출.
- **#324** `memory.json` 항목 `createdAt`이 미래 날짜면 `recencyScore = Math.exp(-days/90)`에서 days<0 → exp(양수)가 1.0을 무한 초과(e+127)해 키워드 관련성을 압도하고 과학표기가 비개발자에게 노출(clock skew·수동편집·백업복원·타임존으로 현실 발생).
  - `src/commands/memory.ts recencyScore`: 반환을 `Math.min(1, Math.exp(...))`로 clamp(미래=최신으로 간주). '약한 보너스(상한 1.0)' 설계 복원.

## 검증 (TDD · red→green)

- `tests/recall-eval.test.ts`: `validateEvalLabels` describe 추가 — 정상/빈/누락 통과, labels 비배열·루트 비객체·query 누락/빈·expectIds 누락/문자열/빈배열/비문자원소 → `EvalFormatError`, 한국어 메시지 검증. + `scoreEval` 정확매칭 회귀(`expectIds:['XYZf1']`이 실 id `f1` 못 잡음 = 거짓통과 0).
- `tests/memory-recall.test.ts`: `recallMemories` recency clamp 추가 — 미래 날짜(2099·+5일) recency ≤ 1.0 + score 폭증/과학표기 없음 + 과거 날짜 정상 반감기 회귀.
- E2E: 각 이슈 재현 복붙 확인. #322 문자열 expectIds → 친절 형식오류(거짓 100% 0). #323 3종 모두 친절 메시지(raw 에러 0). #324 미래 d1 `점수 1.69(최근 1.00)`·정상 d2 `1.39` — e+127 소멸.

## 게이트
- `pnpm build` 성공 · `pnpm test` 1913 pass(180 파일) · `secure scan` CRITICAL:0/HIGH:0/MEDIUM:0(INFO 1=테스트 픽스처).

## 남은 위험
- `validateEvalLabels`는 `--init` 정상 경로 라벨도 통과(회귀 0). 수동편집/오타 라벨만 거부 — 의도된 동작.
- #324 clamp는 미래를 '최신'으로 간주(점수 약간 상위). 미래 날짜는 비정상 데이터라 허용 가능한 트레이드오프(대안: 미래 페널티는 과설계).
