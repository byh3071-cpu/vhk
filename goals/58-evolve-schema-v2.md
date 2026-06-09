---
vhk_format: 1
type: goal
id: 58
title: 진화 제안 스키마 v2(evolve-schema-v2) — P2
status: NOT_STARTED
priority: P2
created: 2026-06-09
leads_to: 61
---

# Goal 58: 진화 제안 스키마 v2 (evolve-schema-v2)

> 출처: 전수검사 — 진화 큐가 규칙(rule) 단일 종류만 표현, 5계층 자기개선과 불일치.

## 근거 (실측)
- `src/commands/evolve.ts`(18674B, SHA `06d6e7c`) → `QUEUE = .vhk/evolve/queue.json`, `EvolveQueueItem{id, patternId, kind:'rule', status, draft, dedupeKey, createdAt, appliedAt?, rulesBackupPath?}`. `kind`가 `'rule'` 단일, `targetLayer` 없음.

## 동작
- `kind` → `targetLayer` 5종 확장(memory / rule / workflow / code / product).
- queue.json v1 → v2 breaking 마이그레이션: 필드 추가 + 기본값 매핑(`kind:'rule'` → `targetLayer:'rule'`). `.bak` 백업 후 원자적 치환(`atomic-write.ts`).

## 수용 기준
- v1 fixture → v2 마이그레이션 무손실 라운드트립(필드 보존 assert).
- 마이그레이션 실패 시 `.bak` 복원, 큐 손상 0.
- 신규 `targetLayer` 항목 `dedupeKey` 충돌 0.

## Completion Check
- [ ] `kind` → `targetLayer` 5종 확장
- [ ] queue.json v1→v2 마이그레이션 + `.bak` 백업 + 원자적 치환
- [ ] 무손실 라운드트립 / 실패 시 복원 / dedupe 충돌 0
- [ ] `node scripts/check-goal-58.mjs` 통과

## Mandatory Reading
- `src/commands/evolve.ts` · `src/lib/read-json.ts` · `src/lib/atomic-write.ts`
