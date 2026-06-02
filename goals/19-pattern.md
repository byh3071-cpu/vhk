---
vhk_format: 1
type: goal
id: 19
title: 패턴 감지 — pattern detection v0 (반복 실패·성공 → avoid/reinforce 후보) — P1
status: NOT_STARTED
priority: P1
version: v2.1.0
---

# Goal 19: pattern detection v0 (Evolution Loop 도미노 3)

> 출처: Evolution Loop 로드맵 — `작업→증거(13)→기억(18)→`**`패턴(19)`**`→진화(20)`. 확정 스펙:
> "active 실패+성공에서 반복 추출 → `avoid`/`reinforce` 후보. 보수적 임계(기본 3회+). **읽기·제안만, 반영 X.** CLI `vhk pattern`."
> 전제: Goal 18(memory schema v2) 완료 — `patterns[]` 빈 배열 + 최소 타입으로 예약됨. 19 = 그 버킷을 감지로 채움. 적용/evolve 는 Goal 20.

## 현황 (19-A 코드 확인 결과)
- **patterns 예약됨** = `src/commands/memory.ts:36-40` `PatternEntry { id: string; [key:string]: unknown }` (최소 타입).
  `emptyV2()`(memory.ts:51) 가 `patterns: []` 초기화. **어디서도 채우지 않음** — 19 가 첫 기록자.
- **입력 소스 존재** = `failures: FailEntry[]` (`{...MemEntry, why?, lesson?}`, memory.ts:29-32) · `successes: SuccessEntry[]` (`{...MemEntry, why?}`, memory.ts:33-35).
  `MemEntry`(memory.ts:20-28) = `{ id, content, tags[], createdAt, status, resolvedAt?, archivedAt? }`.
- **status 선순환** = `'active'|'resolved'|'archived'`(memory.ts:17). `vhk learn`(agent.ts) → `recordLesson`(memory.ts:363) 이 `failures.lesson` 에 active 로 append, `tags:['goal-N'|'no-goal']`.
- **표시 자리만 있음** = `activeMemoryLines()`(memory.ts:357) 이 `patterns.length>0` 면 "패턴 후보 (patterns): N개 — `vhk pattern`" 안내(현재 항상 0). 명령 자체는 미구현.
- **읽기/쓰기 계약** = `readMemory(cwd)`(memory.ts:153) / `writeMemory(cwd, mem)`(memory.ts:168, `.bak` 롤링) / `nextId(bucket, mem)`. BOM-safe.

## 동작 (파일·계약)
- **입력**: `readMemory(cwd)` → `failures` + `successes` 중 **`status==='active'` 만**(`resolved`/`archived` 제외 — 선순환·재제안 방지). decisions/patterns 는 입력 아님.
  - 신호 텍스트: failure = `lesson ?? content`, success = `content`(+`why` 보조).
- **감지 v0 (구조/빈도 — ML/LLM/외부 라이브러리 0)**, 버킷별 독립 2축:
  - **① 태그 군집** — active 항목 태그 빈도. 한 태그가 같은 버킷에서 `≥ 임계` → 후보. (`goal-N`/사용자 태그 포함, `no-goal` 제외.)
  - **② 키워드 문서빈도** — 신호 텍스트 정규화(소문자·구두점 제거·공백 split, 최소 불용어) → 토큰의 **문서빈도**(서로 다른 항목 수). `≥ 임계` 항목 등장 토큰 → 후보. (한국어 형태소분석 없음 → 제외 범위.)
  - 임계 기본 **3**(보수적), `--min <n>` 조정. kind: failures→**`avoid`**, successes→**`reinforce`**.
  - **결정적**: count desc → signal asc 안정 정렬. 동일 입력=동일 출력.
- **출력 — `PatternEntry` 스키마**(placeholder 대체, 4버킷 일관): `{ id, kind:'avoid'|'reinforce', axis:'tag'|'keyword', signal, count, sources[](기여 entry id), summary(사람용 한 줄 — Goal 20 카드 토대), createdAt, status, tags[](소스 태그 합집합 — v3 스코프 토대) }`.
- **멱등/병합**: `detect` = 순수 재계산 → 시그니처(`kind:axis:정규화signal`) 병합. 기존 active 동일 시그니처 → count/sources/summary 갱신(중복 push 금지), 신규 → `nextId('pattern',mem)` push. 자동 삭제 없음.
- **CLI (컨테이너)**: `vhk pattern detect`(`--min`,`--json`) · `list`(`--kind`,`--all`) · `dismiss <n>`(→archived). 별칭 `.alias('패턴')`, `command-registry` `pattern:['detect','list','dismiss']`. NLP 키워드 '패턴/반복/되풀이/버릇/pattern'. `printNextStep()` → `vhk pattern list` · "(Goal 20) `vhk evolve`(나중)".
- **MCP**: `pattern detect`·`pattern list` 노출(`runVhkCli`, 비대화형). dismiss 후속. secret 미포함(memory 파생 → secure scan 관문).

## 철학
① 읽기·제안만 — **RULES.md/적용 반영 0**(Goal 20 영역, 안전 1원칙 "자동 학습 OK·자동 적용 금지") ② active 만 입력 — 선순환 닫힘 존중(해결·보관된 실수는 다시 안 운다) ③ 보수적 임계 — 거짓 패턴보다 미탐 선호 ④ 결정적·멱등 — 재실행해도 중복·표류 0 ⑤ v0 구조/빈도 — 의미·ML 은 미래(v3 Hub), 의존성 0 유지 ⑥ Windows 1급·`safeExecFile`(구현 시).

## Completion Check
- [ ] `PatternEntry` 구체 타입(kind/axis/signal/count/sources/summary/status/tags) — placeholder 대체
- [ ] `detect`: active failures+successes 2축(태그군집·키워드빈도) 감지 → `avoid`/`reinforce` 후보
- [ ] 보수적 임계 기본 3(`--min` 조정) · `resolved`/`archived` 입력 제외 검증
- [ ] 멱등 — 재실행 시 시그니처 병합(중복 patterns 0), 결정적 정렬
- [ ] `vhk pattern list`(--kind/--all) · `dismiss <n>`(→archived) · 별칭 `패턴` + NLP 라우팅
- [ ] **반영 0 회귀 가드** — detect 가 RULES.md/memory 외 파일·다른 버킷 무변경
- [ ] MCP `pattern detect`·`list` 노출(비대화형) · secret 누출 0(secure scan)
- [ ] vhk goal sync → check-goal-19.mjs 생성 → vhk goal check --id 19 통과
- [ ] 신규 테스트(감지·임계·멱등·반영0) + 공통 게이트(typecheck+test+build), 기존 회귀 0

## 제외 범위
- 후보 → 적용/반영(RULES.md), `evolve`, 사람말 카드 [예/아니오/나중에], 기여 실패 `resolved` 닫기 → **Goal 20**.
- Jaccard 토큰셋 근접중복(재서술 반복 포착) · 의미/임베딩 분석 · 한국어 형태소분석 → 후속(v0=구조/빈도만).
- `profile.json` 자동학습 · 기억 자동정리(오래된 active archive 제안) → Goal 20 / v2.x.
- 크로스 프로젝트 패턴 합산 · 글로벌 메모리(`~/.vhk`) · 스코프 규칙 → v3 VHK Hub.

## Mandatory Reading
- src/commands/memory.ts (PatternEntry placeholder:36-40 · MemEntry/FailEntry/SuccessEntry · readMemory/writeMemory/nextId · activeMemoryLines)
- goals/18-memory-schema-v2.md (4버킷·status 선순환·learn 통합 — 입력 계약)
- Notion 🌱 성장 루프 비전(Evolution Loop) · 🚀 릴리즈 로드맵 v2.1.0 Goal 19 확정 스펙(avoid/reinforce·임계 3·반영 X)
