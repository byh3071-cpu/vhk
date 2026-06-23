---
vhk_format: 1
type: goal
id: 77
title: vhk sell — 풀사이클 뒷단 판매 트랙 (RFC 0052 넷째·마지막 구현)
status: DONE
priority: P2
created: 2026-06-19
---

# Goal 77: vhk sell — 풀사이클 뒷단 판매 트랙

> 출처: RFC 0052(풀사이클 뒷단 4트랙) §4·§5. ops(76) 다음 — 뒷단 마지막 트랙.
> `gate.ts` GATE_QUESTIONS 12(판매)가 질문으로만 있던 뒷단에 실행 명령을 추가하는 넷째 트랙.
> 자문형(초안만, 결제 연동·과금 0 — 실패비용 최상위라 가장 보수적, 헌법).

## The Goal

`vhk sell` 이 VISION.md 의 What(제품 한 줄) → 판매 준비 체크리스트(가격·결제수단·환불정책·가치제안) +
가격 페이지 카피·FAQ **초안 생성 프롬프트**(`.vhk/sell-prompt.md`)를 만든다.
content(74)가 추출한 `src/lib/emit-prompt.ts` 공유헬퍼 재사용(4트랙 재구현 0). 생성 프롬프트는
goal 68(remind)·69(negatives)가 깐 Fable5 위생(✅/❌ 예시쌍 · 수치 하드리밋 · "사람 승인 전 결제·과금 금지")을 상속.
content→launch→ops→**sell** 체인 완성(뒷단 4트랙 마감).

## Completion Check

- [x] `_meta` 게이트 통과
- [x] `buildSellPrompt` 순수함수 + `emitPrompt` 공유 헬퍼 재사용(content/launch/ops와 단일 SoT)
- [x] 등록(index·command-registry·cli-args·nlp-router·nlp-run) + MCP(읽기전용, 34→35) + vhk-dir(문서표·gitignore) + COMMANDS/README
- [x] 직접 결제·과금·구독 0 (가격 카피 초안 프롬프트만 — 외부 결제 API 호출 없음)
- [x] 빈 VISION graceful (What 미정 안내, 크래시 0)
- [x] 단위테스트 `tests/sell.test.ts` (buildSellPrompt 순수함수 5건)
- [x] ops(76)→sell 체인 연결(뒷단 4트랙 content→launch→ops→sell 완성)

## Forbidden Actions (OUT)

- 실제 결제·과금·구독·Stripe/Lemon 연동 0 (체크리스트 항목·카피 초안만)
- 기존 tool API 시그니처 변경 0 (GA 안정성)
- `emitPrompt`·`content`·`launch` 동작 변경 0 (회귀 금지 — ops 는 printNextStep command 힌트만 추가)
