# 2026-06-28 — vhk receipt "실차단 3종" 텍스트 드리프트 정정 (코드는 4조건 — forbidden 포함)

> append-only. 추가만, 수정·삭제 금지.

## 배경 (드리프트)
- `decideReceipt`(`src/lib/receipt.ts`)의 block 분기는 실제로 **4조건**: `red || dirty || (staleKnown && stale) || forbiddenViolated`.
- `forbiddenViolated` 는 goal 87(#406, 이미 DONE·머지)이 추가한 정당한 결정론 차단(변경 파일이 mission 금지 glob 매치 = LLM 0 사실, red/dirty/stale 와 동급).
- 그런데 옛 "실차단 3종(red·dirty·stale)" 텍스트가 코드 곳곳에 잔존 → 텍스트가 코드보다 적게 말하는(under-claim) 드리프트. **코드가 정답 → 텍스트를 코드에 맞춤.**

## 한 일 — 정정 8곳 (파일:라인 / 옛 → 새)
1. `src/lib/receipt.ts:19` — `ReceiptDecision` JSDoc: `block: 실차단(red/dirty/stale)` → `…(red/dirty/stale/forbidden)`
2. `src/i18n/ko.ts:295` — `nextBlockMessage`(사용자대면): `막힌 증거(red/dirty/stale)` → `…(red/dirty/stale/forbidden)`
3. `src/commands/receipt.ts:121` — 주석: `영수증 본체(실차단 3종)` → `…(실차단 red·dirty·stale·forbidden)`
4. `scripts/check-goal-86.mjs:65` — 주석: `실차단 3종만 block` → 4조건 명시 + "이 게이트는 기저 3종만 확인, forbidden 은 check-goal-87 소관" 한 줄 추가
5. `scripts/check-goal-86.mjs:66` — `must()` 레이블: `실차단 3종(red·dirty·stale)만 block` → `기저 실차단(red·dirty·stale) block 분기 존재 — forbidden 은 check-goal-87`. **정규식 불변** (goal 86 검증 범위 = 기저 3종 그대로)
6. `tests/receipt.test.ts:58` — describe: `실차단 3종(red·dirty·stale) 중 하나라도면 block` → `기저 실차단 3종(red·dirty·stale) 각각 단독이면 block … (forbidden 은 별도 describe)`. **루프 불변** (red/dirty/stale만 순회 — forbidden 은 L232 별도 테스트)
7. `tests/receipt.test.ts:122` — describe: `차단은 3종만이 결정` → `차단은 실차단이 결정(diff-cover 무관)`
8. `tests/receipt.test.ts:18` — 파일 헤더 불변식 ① 주석: `dirty/stale/red 중 하나라도면 block` → `실차단(red·dirty·stale·forbidden) 중 하나라도면 block` (source `receipt.ts:8` 불변식 헤더와 일치시킴; 특이 어순이라 grep 1차에서 누락 → CI green 확인 후 적발·합류)

### 일부러 "4종"으로 안 바꾼 곳 (정직)
- check-goal-86 레이블(5)·test:58(6)은 **실제로 기저 3종만 검증/순회**한다. 정규식·루프를 안 바꾸면서 레이블만 "4종"이라 쓰면 레이블↔코드 새 드리프트가 됨 → "기저 3종 + forbidden 은 별도(check-goal-87)" 로 정직하게 분담 표기.

## 안 건드린 것 (정당)
- `goals/86-receipt-mvp.md` 수용기준 원문 — DONE goal 기준 사후수정은 "짜맞춤" 오해 → 코드 레이블·테스트·주석만 정정.
- check-goal-86 정규식 / "red/dirty/stale **동급**" 프레이밍(`check-goal-87.mjs:62`·`receipt.test.ts:229/232/273`·`receipt.ts:8/9/45/46/91/104`) — forbidden 을 동급 4번째로 정확히 표현 중이라 유지.
- `receipt.ts` ①②③ 증거카테고리 번호(red①·dirty②·stale③·diff-cover④·intent⑤) — 차단조건 개수가 아니라 증거 분류 인덱스 → 유지.

## 게이트 결과
- ✅ `pnpm build` — exit 0 (src 주석·JSDoc 변경 tsc 통과)
- ✅ `VHK_GATES_SKIP_DEEP=1 node scripts/check-goal-86.mjs` — typecheck ✓ · lint ✓ · `must()` 전건 ✓ (재작성 레이블 포함; 정규식 불변이라 block 분기 매치 유지)
- ✅ `tests/receipt.test.ts` 파싱·수집 — transform+import 성공, **48 테스트 전부 collect** (describe 텍스트 변경에 구문오류 0 입증)
- ⚠️ 전체 vitest 실행 — 로컬 forks "Worker exited unexpectedly" / threads exit 127 (TS-004·TS-005 환경 결함, 단언 실패 아님). 본 변경은 주석·레이블·describe **문자열뿐**(실행 로직 0) → 단언 바이트 동일. **CI 가 진실원** (goal-87-done.md 선례 동일 처리).

## 비고
- 이 레포는 거짓완료를 기계증거로 잡는 도구 → 텍스트가 코드보다 적게 말하는 under-claim 드리프트도 정직성 위반으로 보고 정정.
- check-goal-86(기저 3종 block 분기) / check-goal-87(forbidden→block) 검증 분담을 레이블에 명시화.
