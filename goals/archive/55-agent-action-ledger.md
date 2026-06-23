---
vhk_format: 1
type: goal
id: 55
title: AI 행동 원장(agent-action-ledger) — P1
status: DONE
priority: P1
created: 2026-06-09
completed: 2026-06-10
leads_to: 61 (stats 집계 소스)
---

# Goal 55: AI 행동 원장 (agent-action-ledger)

> 출처: 전수검사 — "AI가 무엇을 실행/차단당했나"의 레포 영속 기록 부재.

## 근거 (실측)
- `src/lib/evidence-ledger.ts` → `LEDGER_PATH_REL = .vhk/ledger.jsonl`, `LedgerEntry{version,date,status,sha,shortSha,dirty}`. 이건 릴리즈 verify 증거 요약만 기록 → AI 행동 단위 로그가 아님(별개, 중복 아님).
- `src/lib/safety-guard.ts` → `runGuarded(action,deps,run)`이 CLI/MCP/NL 공통 단일 chokepoint. 반환 `GuardedOutcome{ran,guard,reason}`. 단 통과 대상은 위험 9종 + strict(save/sync)뿐 → read/edit/test는 미경유.
- `src/lib/risk-policy.ts` → `HIGH_RISK_ACTIONS`(undo, deploy, publish, migrate, cloud-pull, resume, env-write, delete, restore).
- `src/lib/hard-stop-guard.ts` → `ensureNotHardStopped(action)`(트립와이어 차단도 행동 이벤트).

## 동작
- `.vhk/events/ai-actions.jsonl` append-only 행동 원장 신설. `AiActionEntry{ts, action, channel, guard, ran, reason, target?, sha?}`.
- `runGuarded` 반환 `outcome`을 그대로 1줄 append(`guard`/`ran`/`reason` 직매핑). `ensureNotHardStopped` 차단도 기록.
- 기록 범위: 위험행동 + `save`/`commit`. read/edit 등 비가드 행동은 본 원장 범위 밖(정직 표기) — 필요 시 별도 후속 goal.
- 입출력은 `evidence-ledger.ts` 패턴 재사용(`readLedger`/`appendLedgerEntry` 류 + `atomic-write.ts` + `read-json.ts` `stripBom`). raw `JSON.parse` 금지(`check-no-raw-json-parse.mjs` 게이트 준수).

## 수용 기준
- `vhk publish`/`undo` 등 위험행동 1회 → `ai-actions.jsonl`에 정확히 1줄, 6필드 채워짐.
- 비대화형 미승인 차단 시 `reason`이 `no-confirm`/`preview-no-approve`로 기록.
- 손상 라인 skip(읽기 안 죽음), 과거 줄 변경 0(append-only 불변).

## Completion Check
- [ ] `.vhk/events/ai-actions.jsonl` append-only 원장 + `AiActionEntry` 6필드
- [ ] `runGuarded` outcome 매핑 + `ensureNotHardStopped` 차단 기록
- [ ] `evidence-ledger.ts` 패턴 재사용, raw `JSON.parse` 0건
- [ ] `node scripts/check-goal-55.mjs` 통과
- [ ] `node scripts/check-no-raw-json-parse.mjs` 통과

## Mandatory Reading
- `src/lib/evidence-ledger.ts` · `src/lib/safety-guard.ts` · `src/lib/risk-policy.ts` · `src/lib/state-files.ts` · `src/lib/read-json.ts`
