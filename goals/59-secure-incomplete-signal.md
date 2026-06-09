---
vhk_format: 1
type: goal
id: 59
title: secure 불완전 신호(secure-incomplete-signal) — P1
status: DONE
priority: P1
created: 2026-06-09
completed: 2026-06-10
leads_to: 55
---

# Goal 59: secure 불완전 신호 (secure-incomplete-signal)

> 출처: 전수검사 — 스캔이 잘려도(truncated) secure 게이트가 PASS로 처리(거짓 green).

## 근거 (실측)
- `src/commands/verify.ts`(SHA `2d72745`) → `runSecureGate`가 `severe===0`이면 PASS. 스캔이 한도 도달로 잘려도 PASS.
- 3대 truncation: `src/lib/scan-secrets.ts` `MAX_SECRET_FINDINGS=200` / `MAX_LINE_CHARS=4000`, `src/lib/scan-files.ts` `MAX_SCAN_FILE_BYTES=512KB`.
- `ReportStatus`는 이미 PASS/WARN/FAIL 3값 보유(`evidence-ledger.ts`가 import) → incomplete → WARN 저비용 매핑 가능.

## 동작
- 스캔이 한도 도달(truncated)인데 `severe===0`이면 PASS 금지 → WARN(incomplete) + 사유 노출.
- WARN을 `.vhk/ledger.jsonl` status에 전파.

## 수용 기준
- findings 200 초과 / 파일 512KB 초과 / 라인 4000자 초과 케이스에서 status=WARN, 사유 `scan-incomplete` 노출.
- truncation 없으면 기존 PASS 동작 회귀 0.
- WARN이 `.vhk/ledger.jsonl`에 그대로 기록.

## Completion Check
- [ ] truncated + `severe===0` → WARN(incomplete) + 사유 노출
- [ ] WARN을 `.vhk/ledger.jsonl` status에 전파
- [ ] 정상 스캔 PASS 회귀 0
- [ ] `node scripts/check-goal-59.mjs` 통과

## Mandatory Reading
- `src/commands/verify.ts` · `src/lib/scan-secrets.ts` · `src/lib/scan-files.ts` · `src/lib/evidence-ledger.ts`
