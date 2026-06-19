---
vhk_format: 1
type: goal
id: 75
title: vhk launch — 풀사이클 뒷단 런칭 트랙 (RFC 0052 둘째 구현)
status: DONE
priority: P2
created: 2026-06-19
---

# Goal 75: vhk launch — 풀사이클 뒷단 런칭 트랙

> 출처: RFC 0052(풀사이클 뒷단 4트랙) §4·§5. content(74) 다음 순서.
> `gate.ts` GATE_QUESTIONS 11(마케팅)·런칭이 질문으로만 있던 뒷단에 실행 명령을 추가하는 둘째 트랙.
> 자문형(초안만, 게시·발송 0 — 실패비용 high 제외, 헌법). content(74) 산출물 소비.

## The Goal

`vhk launch` 가 VISION.md 의 What(제품 한 줄) → 런칭 준비 체크리스트(도메인·랜딩·데모·OG·채널 후보) +
런칭 게시물·채널별 변형 **초안 생성 프롬프트**(`.vhk/launch-prompt.md`)를 만든다.
content(74)가 추출한 `src/lib/emit-prompt.ts` 공유 헬퍼 재사용(4트랙 재구현 0). 생성 프롬프트는
goal 68(remind)·69(negatives)가 깐 Fable5 위생(✅/❌ 예시쌍 · 수치 하드리밋 · "사람 승인 전 게시·발송 금지")을 상속.

## Completion Check

- [x] `_meta` 게이트 통과
- [x] `buildLaunchPrompt` 순수함수 + `emitPrompt` 공유 헬퍼 재사용(content와 단일 SoT)
- [x] 4지점 등록(index·command-registry·cli-args·nlp) + MCP(읽기전용, 32→33) + COMMANDS/README
- [x] 직접 게시·발송 0 (초안 프롬프트만 — 외부 발송 API 호출 없음)
- [x] 빈 VISION graceful (What 미정 안내, 크래시 0)
- [x] 단위테스트 `tests/launch.test.ts` (buildLaunchPrompt 순수함수 5건)
- [x] `ship`(코드 npm 배포) ≠ `launch`(제품 공개) 구분 명시(COMMANDS/README — RFC 0052 §7)

## Forbidden Actions (OUT)

- 실제 SNS 발송·게시 자동화 0 (초안만)
- ops/sell 동시 구현 금지 (RFC 0052 §5 — 트랙별 개별 goal·개별 PR)
- 기존 tool API 시그니처 변경 0 (GA 안정성)
- `emitPrompt`·`content` 동작 변경 0 (회귀 금지)
