---
vhk_format: 1
type: goal
id: 61
title: 통계·대시보드 집계(stats-blocks) — P2
status: DONE
priority: P2
created: 2026-06-09
completed: 2026-06-10
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
- [x] `vhk stats` 읽기전용 명령(파일 쓰기 0건 — check-goal-61 grep 검증)
- [x] `readLedger` + `ai-actions.jsonl`(reader) + evolve queue 3소스 집계
- [x] 패스율/차단율/진화 적용율 카운트 정확(순수함수 + fixture 테스트)
- [x] `node scripts/check-goal-61.mjs` 통과
- [~] ⚠️ 차단율 **실데이터**는 Goal 55(action-ledger) 미머지 → 0건 표기(블로커 기록). 집계 로직은 fixture 로 검증 완료.

## ✅ Completion (2026-06-10) — 부분(55 의존)
- **vhk stats**(src/commands/stats.ts, 읽기 전용): 3소스 집계 — 증거 원장(readLedger PASS/WARN/FAIL) + AI 행동 원장(readAiActions 차단율) + 진화 큐(적용율). logger SoT 경유(Goal 51), printNextStep. **파일 쓰기 0건**(check-goal-61 가 write API grep 으로 강제).
- **순수 계산**: countLedgerStatus / calcBlockRate(ran=false/total) / calcApplyRate(applied/total). total 0 → rate 0(NaN 방지).
- **ai-actions reader**(src/lib/ai-actions-ledger.ts): Goal 55 스키마(AiActionEntry 6필드) reader. **파일 없으면 [] 안전** + 손상 라인 skip + BOM-safe(evidence-ledger 패턴, 라인 변수 파싱이라 raw-json-parse 가드 통과).
- **4지점 등록**: index.ts(.command('stats')+별칭 통계) · command-registry TOP_LEVEL · cli-args KNOWN_COMMAND_TOKENS(stats/통계) · i18n ko.stats. (서브커맨드 없는 top-level → CONTAINER 등록 불요.)
- **블로커(55 의존)**: ai-actions.jsonl **생성자(runGuarded append)는 Goal 55** — 별도 배치 미머지. reader/집계/표기는 완성·테스트(fixture)됐으나 운영 차단율 실수치는 55 머지 후. stats 는 "데이터 없음 (action-ledger 미연동)" 정직 표기. → `vhk blocker` 기록.
- **게이트**: build ✓ · tsc ✓ · test:run 회귀 0 · check-goal-61 ✓(파일쓰기0 grep 포함) · command-registry drift 10 pass · check-no-raw-json-parse ✓.

## Mandatory Reading
- `src/lib/evidence-ledger.ts`(`readLedger`) · `src/commands/evolve.ts`(queue) · `src/commands/status.ts`(출력 패턴 모범)
