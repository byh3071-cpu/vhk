---
vhk_format: 1
type: goal
id: 58
title: 진화 제안 스키마 v2(evolve-schema-v2) — P2
status: DONE
priority: P2
created: 2026-06-09
completed: 2026-06-10
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
- [x] `kind` → `targetLayer` 5종 확장(memory/rule/workflow/code/product). 하위호환 위해 `targetLayer?` 추가 + `kind` 보존
- [x] queue.json v1→v2 마이그레이션(migrateQueueToV2) + `.bak`(롤링)·`.v1.bak`(원본) 백업 + atomicWriteFile 원자 치환
- [x] 무손실 라운드트립 / 쓰기 실패 시 `.bak` 복원 / dedupe 충돌 0(findDedupeCollisions)
- [x] `node scripts/check-goal-58.mjs` 통과

## ✅ Completion (2026-06-10)
- **스키마 v2**: `QUEUE_VERSION=2`, `TargetLayer` 5종 + `TARGET_LAYERS`. `EvolveQueueItem.targetLayer?`(옵션 — v1 항목/기존 테스트 호환), `kind:'rule'` 은 deprecated 보존. `dedupeKey=${patternId}:${targetLayer}`(v1 'rule' 과 동일값 → 충돌 0).
- **마이그레이션**(migrateQueueToV2, 순수·무손실): 모든 항목에 `targetLayer='rule'` 부여 + dedupeKey 재계산 + version 승격. `...it` 스프레드로 id/status/draft/appliedAt/rulesBackupPath 전부 보존.
- **readQueue**: `parsed.version !== QUEUE_VERSION` 이면 자동 변환(읽기는 디스크 미변경). 파일없음/손상 → {version:2, items:[]}.
- **writeQueue**: 쓰기 전 `.bak`(롤링) + 원본 v1 이면 `.v1.bak`(1회) 백업 → `atomicWriteFile` 원자 치환 → 실패 시 `.bak` 복원(손상 0).
- **충돌 검출**(findDedupeCollisions): 점유(pending/applied) 항목 dedupeKey 중복만 충돌, rejected 중복은 허용. 5계층 확장 시 layer 다르면 키 달라 충돌 구조적 0.
- **회귀0 설계**: `targetLayer` 옵션 + `kind` 보존 → 기존 evolve.test 35케이스 무수정 통과(version 단언 1줄만 v2 로 갱신). 신규 +13케이스(마이그레이션·라운드트립·dedupe·백업).
- **게이트**: build ✓ · tsc ✓ · evolve.test 48 pass · check-goal-58 ✓ · check-no-raw-json-parse ✓.

## Mandatory Reading
- `src/commands/evolve.ts` · `src/lib/read-json.ts` · `src/lib/atomic-write.ts`
