---
vhk_format: 1
type: goal
id: 45
title: 증거 원장 커밋 — reports 요약(ledger.jsonl) git 추적 — P1
status: NOT_STARTED
priority: P1
created: 2026-06-07
leads_to: 릴리즈 증거 영속화 (레포만 보고 확인)
---

# Goal 45: 증거 원장 커밋

> 출처: VHK 핸드오프(2026-06-07, 실측) Task B. Goal 44 SHA와 묶음.

## 근거 (실측)
- `reports/`가 `.vhk/.gitignore`로 제외(휘발) → 레포만 보고 "그 릴리즈가 증거 통과였나" 확인 불가.

## 동작
- `reports/` 전체 커밋은 부담 → 요약 한 줄(`reports/ledger.jsonl`에 `{version, date, gates: PASS/FAIL, sha}` append)만 git 추적,
- 또는 release 아티팩트로 `latest.json` 첨부.
- Goal 44 SHA와 묶음.

## 수용 기준
- 릴리즈 증거 통과 상태가 레포에 영속으로 남는다.

## Completion Check
- [ ] reports/ledger.jsonl(요약 한 줄) git 추적 또는 release 아티팩트 첨부
- [ ] 각 항목에 version·date·gates·sha 기록
- [ ] 회귀 테스트
- [ ] check-goal-45.mjs 통과
- [ ] 공통 게이트(typecheck+test+build) 통과, 회귀 0

## Mandatory Reading
- .vhk/.gitignore
- src/commands/verify.ts
