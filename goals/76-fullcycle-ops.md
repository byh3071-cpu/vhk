---
vhk_format: 1
type: goal
id: 76
title: vhk ops — 풀사이클 뒷단 운영 트랙 (RFC 0052 셋째 구현)
status: DONE
priority: P2
created: 2026-06-19
---

# Goal 76: vhk ops — 풀사이클 뒷단 운영 트랙

> 출처: RFC 0052(풀사이클 뒷단 4트랙) §4·§5. launch(75) 다음 순서.
> `gate.ts` GATE_QUESTIONS 13(피드백)·운영이 질문으로만 있던 뒷단에 실행 명령을 추가하는 셋째 트랙.
> 자문형(초안만, 중단·삭제·피벗 실행 0 — 실패비용 high 제외, 헌법). 런칭(75) 후 30일 운영 데이터 회고.

## The Goal

`vhk ops` 가 VISION.md 의 What(제품 한 줄) → 운영 현황 체크리스트(피드백 채널·30일 사용자 수·탈출조건) +
운영 회고·다음 결정(유지/피벗/아카이브) **초안 생성 프롬프트**(`.vhk/ops-prompt.md`)를 만든다.
content(74)가 추출한 `src/lib/emit-prompt.ts` 공유 헬퍼 재사용(4트랙 재구현 0). 생성 프롬프트는
goal 68(remind)·69(negatives)가 깐 Fable5 위생(✅/❌ 예시쌍 · 수치 하드리밋 · "사람 승인 전 중단·삭제 금지")을 상속.
today/standup 회고 정신 재사용(RFC 0052 §5).

## Completion Check

- [x] `_meta` 게이트 통과
- [x] `buildOpsPrompt` 순수함수 + `emitPrompt` 공유 헬퍼 재사용(content/launch와 단일 SoT)
- [x] 등록(index·command-registry·cli-args·nlp-router·nlp-run) + MCP(읽기전용, 33→34) + vhk-dir(문서표·gitignore) + COMMANDS/README
- [x] 직접 중단·삭제·피벗 0 (회고·결정 초안 프롬프트만 — 외부 발송/실행 API 호출 없음)
- [x] 빈 VISION graceful (What 미정 안내, 크래시 0)
- [x] 단위테스트 `tests/ops.test.ts` (buildOpsPrompt 순수함수 5건)
- [x] launch(75) → ops 체인 연결(printNextStep command — content→launch→ops 흐름 완성)

## Forbidden Actions (OUT)

- 실제 제품 중단·아카이브·대량 삭제 자동화 0 (회고·제안 초안만)
- sell(77) 동시 구현 금지 (RFC 0052 §5 — 트랙별 개별 goal·개별 PR)
- 기존 tool API 시그니처 변경 0 (GA 안정성)
- `emitPrompt`·`content` 동작 변경 0 (회귀 금지 — launch 는 printNextStep command 힌트만 추가)
