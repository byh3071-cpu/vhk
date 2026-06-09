---
vhk_format: 1
type: goal
id: 61
title: 통계·대시보드 집계(stats-blocks) — P2
status: NOT_STARTED
priority: P2
created: 2026-06-09
leads_to: 0 (대시보드 종착)
---

# Goal 61: 통계·대시보드 집계 (stats-blocks)

> 출처: 전수검사 — 패스율/차단율/진화 적용율을 한 눈에 보는 집계 부재.

## 근거 (실측)
- `src/commands/`에 `stats.ts` 없음.
- 집계 소스 분산: `.vhk/ledger.jsonl`(릴리즈 verify 요약, `readLedger`), evolve queue(`.vhk/evolve/queue.json`), pattern(`pattern.ts`).
- 보류 해소: `evidence-ledger.ts`는 version/status/sha만 기록 → AI 차단/승인 이벤트 집계 소스 아님. `runGuarded` outcome은 현재 어디에도 영속되지 않음.

## 동작
- `vhk stats` 신규 명령(읽기전용). `readLedger` + `ai-actions.jsonl`(G55) + evolve queue 집계 → 패스율/차단율/진화 적용율 블록 출력.
- 선행 의존: G55(행동 원장) 필수 — 없으면 차단율 집계 불가.

## 수용 기준
- ledger N줄 → PASS/WARN/FAIL 카운트 정확.
- `ai-actions.jsonl` 차단율(`ran=false`/total) 정확.
- 읽기전용 — 파일 쓰기 0건(grep + 테스트 검증).

## Completion Check
- [ ] `vhk stats` 읽기전용 명령(파일 쓰기 0건)
- [ ] `readLedger` + `ai-actions.jsonl` + evolve queue 집계
- [ ] 패스율/차단율/진화 적용율 카운트 정확
- [ ] `node scripts/check-goal-61.mjs` 통과

## Mandatory Reading
- `src/lib/evidence-ledger.ts`(`readLedger`) · `src/commands/evolve.ts`(queue) · `src/commands/status.ts`(출력 패턴 모범)
