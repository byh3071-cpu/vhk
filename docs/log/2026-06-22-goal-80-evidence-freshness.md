# 2026-06-22 — Goal 80: 증거 신선도 review 연결 (SHA≠HEAD/dirty → 낡음 강등)

> append-only. 추가만, 수정·삭제 금지.

## 한 일
- **Goal 80 DONE** — `vhk review` 의 증거 신선도 판정을 **커밋 SHA 기반**으로 승격(RFC 0053 §4 D3, Goal 44 의 소비 측 완결).
  - 기록은 됐는데 소비를 안 하던 갭 해소: Goal 44 가 `latest.json` 에 HEAD SHA·dirty 를 **기록**까지 했으나, review 출력은 여전히 *"신선도는 생성시각으로만 추정"* 이었다 → 이제 review 가 그 SHA 를 읽어 현재 HEAD 와 비교.

## 변경 (산출물 포인터)
- `src/commands/review.ts`
  - `assessFreshness(report, current, nowMs)` — 증거에 `commit`(SHA) 있으면 verify 의 `checkEvidenceFreshness` 재사용해 SHA≠HEAD/dirty 판정(`basis: 'sha'`). SHA 없는 구(舊)증거는 생성시각 폴백(`basis: 'time'`, 하위호환).
  - `EvidenceFreshness` 에 `basis`('sha'|'time') + `reasons`(낡음 사유) 추가.
  - `crossCheck(..., current = null)` — current(HEAD) 옵셔널 주입(순수성 유지: IO 는 review() 에서).
  - `review()` 가 `getCommitInfo(cwd)` 로 현재 HEAD 읽어 전달. disclaimer 문구 "생성시각으로만 추정" → "SHA로 판정(구버전은 시각 폴백)".
- `tests/review.test.ts` — SHA 신선도 7케이스(일치=신선/불일치=강등/dirty=강등/구증거=시각폴백/현재미상=낡음/disclaimer) + 통합 end-to-end 강등 1케이스.
- `scripts/check-goal-80.mjs` — 고유 게이트(배선·시그니처·문구·테스트·Forbidden 불변).
- `goals/80-evidence-freshness-review.md` — status DONE + 완료체크 전부 체크.
- `goals/README.md` — 자동 재생성(gen-goals-index).

## 검증
- `npx vitest run tests/review.test.ts` → 33 pass (신규 8 포함).
- `pnpm build` OK · 전체 테스트 1768 pass(드리프트 1건은 goal 80 status 갱신·index 재생성으로 해소).
- `node scripts/check-goal-80.mjs` (SKIP_DEEP) → 고유검증 전부 ✓.
- 외부 영향 0: `crossCheck`/`EvidenceFreshness` 소비자는 review.ts 단독(grep 확인). verify/verify-report 시그니처 불변(GA).

## 교훈
- SHA 비교 로직은 **이미 verify.ts 에 존재**(`checkEvidenceFreshness`+`getCommitInfo`) — Goal 80 은 신규 구현이 아니라 *기존 순수함수를 review 로 배선*하는 일이었다. "기록 있는데 소비 안 함" 갭은 대개 새 코드가 아니라 연결선이 빠진 것.
- 순수성 유지: 신선도 판정 함수는 `current`(HEAD)·`nowMs` 를 **주입** 받게 유지 → IO 는 핸들러(review())에만. crossCheck 가 순수라 테스트가 SHA 매트릭스를 격리 검증 가능(git 레포 없이).
- 강등은 confidence 캡까지만(advisory exit 0 유지) — review 는 권고 신호라 fail 격상 안 함(goal 80 Forbidden). 활성 작업 중 tree dirty 면 medium 으로 떨어지는 게 정상(정직 신호).

## 적대 리뷰 반영 (7-에이전트 워크플로, 3렌즈+반증)
- blocker/major **0**. confirmed 2건 모두 nit, dropped 2건(반증 기각 — confirmed:true no-op·SHA가 시각무시는 의도된 docstring 기존문서화).
- **nit#1(테스트 공백)** 반영: `generatedAt 파싱불가 + commit 있음` 조합 회귀 가드 추가 — SHA 분기가 ageMs 안 쓰고 note 는 shortSha 만 써 NaN/null 누출·크래시 0 임을 고정.
- **nit#2(문구)** 반영: 비개발자 사용자가 "advisory 통과인데 왜 항상 medium?" 오해 방지 — disclaimer 에 "미커밋(dirty)이면 신뢰도 상한 medium(커밋 후 verify 시 high 가능)" 1줄. 코드 동작 변경 0.
- 결과: review 테스트 33→35 pass, 전 게이트(typecheck/lint/test/build) + 고유검증 16 전부 ✓.

## 다음
- Goal 81(제품 설명 단일 SoT, P1) — brief↔package.json.description 불일치 제거. 개별 PR.
