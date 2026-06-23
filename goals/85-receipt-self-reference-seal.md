---
vhk_format: 1
type: goal
id: 85
title: receipt/verify dirty 판정에서 자기 산출 추적파일 제외 (#315 자기참조 봉인) — P0
status: DONE
priority: P0
created: 2026-06-23
leads_to: receipt가 자기 ledger 때문에 늘 block되는 자기모순 제거 (RFC 0056 T1 선결)
---

# Goal 85: #315 자기참조 봉인 — dirty 판정에서 자기파일 제외

> 출처: RFC 0056 §6 선결 · #315 · [dev log 2026-06-23 적대검증 §B](../docs/log/2026-06-23-rfc0056-adversarial-review.md).

## 근거 (실측 — 코드 확정)
- `src/commands/verify.ts:351` — verify 종료 시 `appendLedgerEntry`를 **무조건 시도** → `.vhk/ledger.jsonl` append.
- `src/lib/evidence-ledger.ts:12-16` 주석 — 이 파일은 goal 45가 "repo 영속 증거"로 **의도적으로 git 추적**(gitignore 제외 안 함). 즉 append = 작업트리 dirty.
- `src/lib/evidence-ledger.ts:60` dedup — 마지막 항목과 (version·sha·status·dirty) 동일 시 skip → "가만 두면 늘 빨강"은 과장이나, **커밋 직후 첫 verify는 sha 변경으로 append → ledger.jsonl만 dirty**.
- ⟹ 소스를 커밋까지 끝낸 clean 상태에서도 receipt가 "dirty면 block"이면 **vhk 자신이 남긴 ledger 한 줄 때문에 늘 block** = 자기모순. events/ai-actions.jsonl도 동일(`safety-guard.ts:47`).

## 동작
- dirty 판정(`checkEvidenceFreshness` / 향후 receipt decision)에서 **자기 산출 추적파일 화이트리스트**(`.vhk/ledger.jsonl`·`.vhk/events/*.jsonl`)를 제외. git status 파싱 시 해당 경로만 필터.

## 수용 기준
- 소스 커밋 완료(clean) 후 verify→receipt가 자기 ledger append만으로는 dirty/block 되지 않는다.
- **퇴행 0**: 진짜 소스 변경(미커밋)은 여전히 dirty/block. 제외 범위 과확장 0.
- 화이트리스트는 한 곳(SoT) — 분산 금지.

## Completion Check (작은 단위 — 완료)
- [x] 자기파일 화이트리스트 상수 (SoT 한 곳, glob/경로) — `src/lib/self-tracked.ts` `SELF_TRACKED_FILES` + `isSelfTrackedPath`/`filterSelfTrackedLines`(receipt decision 경로 재사용 가능)
- [x] dirty 판정에 필터 적용 — `src/lib/git-repo.ts` `getCommitInfo` 가 porcelain 라인을 `filterSelfTrackedLines` 로 거른 뒤 dirty 판정. 이 단일 통로가 verify 증거·`checkEvidenceFreshness`(현재/증거 dirty)·review 신선도 전부에 반영됨.
- [x] 사각지대 방지 테스트 — `tests/self-tracked.test.ts`(과확장 0: 그 외 .vhk·.jsonl 아닌 파일·이름만 비슷한 경로 모두 false) + `tests/verify-sha.test.ts`(자기 ledger만 → dirty=false / 자기 ledger+소스 → dirty=true / .vhk/config.json → dirty=true)
- [x] 한계 명시 — `src/lib/self-tracked.ts` 헤더 주석 + `git-repo.ts` 인라인 주석에 "이 제외로 vhk 가 자기 ledger 를 위조해도 dirty 로 못 잡는다"는 ②자기참조 사각지대를 정직하게 박음
- [x] 공통 게이트 통과(_meta), 회귀 0 — `pnpm build` ✓ · 전체 테스트 1819 pass(자기파일 e2e 1건 타임아웃 플레이크, 격리 재실행 green)
- [x] check-goal-85.mjs (vhk goal sync 자동생성 + goal 고유 검증 손추가) — 게이트 통과

## 구현 노트 (선조사)
- goal 82(.vhk gitignore 정합)와 **다른 층위**: 82는 추적 *제외*, 85는 "추적하되 dirty 판정에서 제외". ledger/events는 0056 핵심("repo 영속 증거")이라 추적 유지가 **전제** — gitignore로 빼면 안 됨.
- ★사각지대(정직): 자기파일을 dirty 판정서 빼면 vhk가 자기 ledger를 조작해도 못 잡는다. → 화이트리스트를 **최소·정확**하게, 테스트로 고정. ②자기참조 문제의 연장이라 "최강 도그푸딩 자산(자기 거짓완료 정직 공개)"과 톤 일치.

## Forbidden Actions (OUT)
- 진짜 소스 변경(미커밋) dirty 무력화 0 — 자기 산출 추적파일만 제외.
- ledger/events를 gitignore로 빼서 "dirty 안 나게" 우회 금지 (0056 증거영속 붕괴).

## Mandatory Reading
- src/commands/verify.ts (appendLedgerEntry·checkEvidenceFreshness) · src/lib/evidence-ledger.ts · src/lib/action-ledger.ts · src/lib/safety-guard.ts · RFC 0056 §6
