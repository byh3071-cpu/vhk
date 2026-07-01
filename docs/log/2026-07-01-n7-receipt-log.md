# 2026-07-01 — N7: receipt-log 영속 (복리 척추 2/2)

> append-only. 추가만, 수정·삭제 금지.

## 한 일
`vhk receipt` 발행마다 측정 엔트리 1줄을 `.vhk/events/receipt-log.jsonl`에 append. 콘솔 휘발이던 decision 판정을 영속 → "거짓완료 판정 분포" 추세 토대(N6 `vhk stats --trend`가 소비, #374 evolve 효과측정이 applied 시점과 조인).

### 변경
- `src/lib/receipt-log.ts` (신규) — `diff-cover-log.ts` 패턴 미러. 순수 `buildReceiptLogEntry(Receipt)` + `readReceiptLog` + `appendReceiptLog`. 측정치만(decision·SHA·red·gateStatus·dirty·stale·diffCoverRatio·forbiddenHits·scopeWarnings) — reasons/honesty 원문·사적 경로 0.
- `src/commands/receipt.ts` — `writeReceipt` 뒤 best-effort `appendReceiptLog`(try/catch — append 실패가 본 판정/출력 안 막음) + import.
- `tests/receipt-log.test.ts` (신규) — 10 테스트(매핑·null 처리·라운드트립·손상 skip·append-only).

### 위치·자기참조 봉인
`.vhk/events/receipt-log.jsonl` — `self-tracked.ts:isSelfTrackedPath`가 `.vhk/events/*.jsonl` prefix 제외 → receipt 가 자기 로그 append 해도 다음 receipt 의 dirty 판정 미오염(#315 동형). append는 dirty 수집(collectReceipt) **뒤**라 자기 발행이 자기 판정에 안 섞임. `.vhk/events/`는 gitignore 아님 → 추적(추세 영속).

### 철칙 부합
측정전용·읽기 토대. decision 로직 불변(decideReceipt 미변경) — 단조성 불변식 보존. LLM 0.

### TDD + 도그푸딩
RED(module 없음) → GREEN 10 pass → `vhk verify` 5게이트(tsc/lint/test:run/build/secure) **PASS**. mission scope 준수 ✓. read-only 적대 리뷰(cavecrew-reviewer, 쓰기 없음).

## 발견(기록만)
- `.gitattributes`에 `events/*.jsonl merge=union` **미설정** — diff-cover-log.ts 주석이 주장하나 실제 없음(기존 latent 갭, N7 무관). 멀티PC append 분기 시 줄 충돌 가능 — 별도 1줄 PR 후보.

## 다음
- N3(`vhk win` 성공기록) → N11(evolve-nudge Stop hook) → 백로그 계속.
