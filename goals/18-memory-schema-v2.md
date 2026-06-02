---
vhk_format: 1
type: goal
id: 18
title: 기억 구조화 — memory schema v2 (4버킷 + learn 통합) — P1
status: NOT_STARTED
priority: P1
version: v2.0.0
---

# Goal 18: memory schema v2 (Evolution Loop 도미노 2)

> 출처: Evolution Loop 로드맵. 평면 memory.json → 4버킷 구조화. `.vhk` 포맷 breaking → **v2.0.0**.
> 전제: Trust Loop(scope/verify/review) 완성. 기억을 패턴(19)·진화(20)의 학습 입력으로 구조화.

## 현황 (18-A 코드 확인 결과)
- **memory.json v1** = `.vhk/memory.json` **평면 JSON 배열** `[{ content, addedAt, tags? }]` (schemaVersion 없음).
  `src/commands/memory.ts` `loadMemories`/`saveMemories`, `memoryAdd/List/Remove`. BOM-safe `readJsonFile` 사용.
- **learn** = `src/commands/agent.ts:37` → `appendLearning`(`src/lib/state-files.ts`) → `docs/state/learnings.md` append.
  현재 메시지(agent.ts:49) "결정사항은 vhk memory add — **SoT 분리**". ← 18에서 통합으로 갱신.
- **learnings.md** = append-only `- [YYYY-MM-DD goal-N] 한 줄 교훈.` (실패와 무관한 독립 교훈 다수).
- **독립 교훈 표현 결정:** learnings.md 항목 → `failures` 의 `FailEntry { what:'', why:'', lesson: 교훈텍스트 }`
  (실패 본문 없음 → what 비우고 lesson 만 채움). 날짜/goal 태그는 tags 로 보존.
- **"분리 SoT / 이중기록 금지" 문구 위치:** agent.ts:49(코드 메시지), CLAUDE.md, AGENTS.md → 18-C 에서 통합으로 갱신.

## 동작 (파일·계약)
- **v2 스키마**: `{ schemaVersion:2, decisions[], failures[], successes[], patterns[] }`.
  - decisions: v1 평면 항목 이관. failures: `{...,why?,lesson?}`(교훈 단일 SoT). successes: `{...,why?}`. patterns: 19에서 채움(v0 빈 배열).
  - 모든 항목 `status: 'active'|'resolved'|'archived'`(기본 active) + `resolvedAt?/archivedAt?`.
- **자동 마이그레이션**(멱등): v1 배열 읽으면 v2 로 변환·`.bak` 백업 후 재기록. learnings.md 흡수 → failures.
- **learn 통합(breaking)**: `vhk learn` → memory v2 `failures.lesson` 기록. learnings.md 신규 기록 중단(기존은 흡수).
- 기존 `memory add/list/remove` 무파괴. BOM-safe. secret 미포함.

## 철학
① 기억은 학습 입력 — 구조화해야 패턴·진화가 본다 ② 교훈 단일 SoT(learn 통합, 이중기록 폐지) ③ 선순환(status+archive — 해결된 실수는 조용해짐) ④ 자동 마이그레이션·백업(데이터 손실 0) ⑤ GA 약속대로 breaking 은 메이저(v2.0.0).

## Completion Check
- [ ] memory.json `schemaVersion:2` + 4버킷(decisions/failures/successes/patterns)
- [ ] failures `{what,why,lesson}` · successes `{what,why}` 타입
- [ ] v1 평면 배열 → v2 자동 마이그레이션 (멱등 — v2 재실행 무변경) + `.bak` 백업
- [ ] learn → memory v2 failures.lesson 통합 + docs/state/learnings.md 마이그레이션 흡수
- [ ] "분리 SoT/이중기록 금지" 문구 갱신 (agent.ts·CLAUDE.md·AGENTS.md — 문서·코드 불일치 0)
- [ ] 항목 status(active/resolved/archived) + `vhk memory archive <n>` 명령
- [ ] 기존 memory add/list/remove 무파괴 (회귀 0) · BOM-safe
- [ ] vhk goal sync → check-goal-18.mjs 생성 → vhk goal check --id 18 통과
- [ ] CHANGELOG breaking 명시 + 공통 게이트(typecheck+test+build+secure)

## 제외 범위
- patterns 채우기(감지) → Goal 19. evolve/적용 → Goal 20.
- 의미기반 분석(v0=구조/빈도). 외부 ML/LLM/라이브러리.
- profile.json → Goal 20.

## Mandatory Reading
- src/commands/memory.ts (v1 평면 배열 + load/save)
- src/commands/agent.ts (learn) + src/lib/state-files.ts (appendLearning/learnings.md)
- src/lib/read-json.ts (readJsonFile/stripBom — BOM-safe)
