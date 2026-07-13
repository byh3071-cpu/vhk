# 2026-07-13 — #458 런칭·운영 교훈 memory 누적 + 다음 사이클 recall 주입

> 이슈: #458 (원 Epic #279 "goal74 뒷단" 서브이슈 4/5) · 브랜치: feat/458-memory-launch-loop

## 결론

뒷단 4명령(content/launch/sell/ops)이 프롬프트 생성 시 `.vhk/memory` 과거 교훈을 자동 회상해
`[과거 교훈]` 섹션(≤3개·각 1줄 절삭)으로 주입하고, launch/ops 프롬프트에 `vhk learn`/`vhk win`
기록 지시를 편입(자문형 — 자동 기록 아님). 기존 memory v2 자산 100% 재사용, LLM 호출 0.

## 실측 (구현 전 정찰)

- `recallMemories`(src/commands/memory.ts) = **순수 함수, 로깅 없음**. `logRecall` 은
  `memoryRecall`(source:'recall')·safety-guard(source:'jit') 두 곳에서만 호출.
- eval 평가셋(src/commands/memory-eval.ts:198)은 `source === 'recall'` 만 사용 →
  뒷단에서 `recallMemories` 직접 호출(로깅 없는 내부 경로)이면 **실쿼리 데이터 오염 0**(measure-first).
- 누적 경로는 이미 존재: `vhk learn`(recordLesson→failures.lesson) · `vhk win`(recordSuccess→successes).
- 주입 렌더 선례: loop-brief.ts "관련 교훈 (recall)" — recallForAction + 첫 줄만 렌더.
- 뒷단 4명령은 동일 구조: `build*Prompt(input)`(순수) → `emitPrompt`. #457 secure 게이트가
  content/launch/sell 프롬프트에 이미 편입된 최신 main(769bfc7) 기준.

## 설계

- 신규 `src/lib/prompt-recall.ts` (단일 SoT — 4명령 드리프트 0):
  - `formatRecallLessons` (순수): hit → `(결정|실패|성공) 한 줄` — failure 는 lesson 우선,
    개행 붕괴 + 100자 절삭, ≤3 하드리밋.
  - `lessonsSectionLines` (순수): `[과거 교훈 — …(.vhk/memory)에서 회상]` 섹션. 빈 배열 = 섹션 생략. ≤3 이중 방어.
  - `recallLessonLines` (fs 글루): readMemory→recallMemories(k=3)→포맷. best-effort —
    손상 memory 등 어떤 실패도 뒷단 본 기능을 막지 않음(빈 배열).
- 4명령: `*Input` 에 `lessons?: string[]` 추가(옵셔널 — breaking 0) + 명령별 고정 회상 쿼리
  (예: launch='런칭 게시 발표 채널 홍보') + 글루에서 주입.
- 누적 지시(자문형): ops [그다음] 3번 항목 + launch [규칙] 1줄 — `vhk learn`/`vhk win` 기록 안내.
  content/sell 은 회고 성격이 아니라 제외(프롬프트 비대 금지).

## 검증

- TDD: RED(신규 22개 실패 관찰) → GREEN(46/46) → 전체 2434 pass · build · lint green.
- 회귀 고정 테스트: `recall-log.jsonl 미적재`(오염 방지) · 섹션 생략 · ≤3 하드리밋 · 1줄 절삭 · 손상 memory 크래시 0.
- E2E: 임시 프로젝트에 memory 심고 `vhk launch` 실행 — 교훈 2개 주입 + recall-log 미생성 확인.
  빈 프로젝트 `vhk ops` — 섹션 생략 + memory.json litter 미생성 확인.

## 교훈

- 회상 로그(recall-log.jsonl)는 eval 평가셋 원천 — 자동 발사 고정 쿼리는 절대 적재 금지.
  순수 함수(recallMemories) 직접 호출이 가장 싼 오염 방지책 (source 분기 추가보다 단순).
- 워크트리 node_modules 는 비어 있을 수 있음 — tsup/vitest 는 부모 .bin 으로 돌지만 eslint 는
  실패 → 워크트리에서 게이트 돌리기 전 `pnpm install` 선행.
