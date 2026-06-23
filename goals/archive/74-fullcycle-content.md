---
vhk_format: 1
type: goal
id: 74
title: vhk content — 풀사이클 뒷단 콘텐츠 트랙 (RFC 0052 첫 구현)
status: DONE
priority: P2
created: 2026-06-16
---

# Goal 74: vhk content — 풀사이클 뒷단 콘텐츠 트랙

> 출처: RFC 0052(풀사이클 뒷단 4트랙). 레포+노션 전수조사 "사상은 풀사이클, 실행은 반쪽" —
> `gate.ts` GATE_QUESTIONS 10~13(콘텐츠화·마케팅·판매·피드백)이 질문으로만 있던 뒷단에
> 실행 명령을 추가하는 첫 트랙. 자문형(초안만, 게시·발송 0 — 실패비용 high 제외, 헌법).

## The Goal

`vhk content` 가 VISION.md 의 What(제품 한 줄) → 블로그/스레드/SEO 메타 **초안 생성 프롬프트**
(`.vhk/content-prompt.md`)를 만든다. `work.ts` 의 `emitPrompt` 를 공유 헬퍼(`src/lib/emit-prompt.ts`)로
추출해 재사용(4트랙 재구현 0). 생성 프롬프트는 goal 68(remind)·69(negatives)가 깐 Fable5 위생
(✅/❌ 예시쌍 · 수치 하드리밋 · "사람 승인 전 게시·발송 금지")을 상속.

## Completion Check

- [x] `_meta` 게이트 통과
- [x] `buildContentPrompt` 순수함수 + `emitPrompt` 공유 헬퍼(work.ts → `src/lib/emit-prompt.ts` 추출)
- [x] 4지점 등록(index·command-registry·cli-args·nlp) + MCP(읽기전용, 31→32) + COMMANDS/README
- [x] 직접 게시·발송 0 (초안 프롬프트만 — 외부 발송 API 호출 없음)
- [x] 빈 VISION graceful (What 미정 안내, 크래시 0)
- [x] 단위테스트 `tests/content.test.ts` (buildContentPrompt 순수함수 5건)

## Forbidden Actions (OUT)

- 실제 SNS 발송·게시 자동화 0 (초안만)
- launch/sell/ops 동시 구현 금지 (RFC 0052 §5 — 트랙별 개별 goal·개별 PR)
- 기존 tool API 시그니처 변경 0 (GA 안정성)
- `emitPrompt` 동작 변경 0 (work 시작/인수인계 프롬프트 회귀 금지)
