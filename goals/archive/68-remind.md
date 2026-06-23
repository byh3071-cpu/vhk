---
vhk_format: 1
type: goal
id: 68
title: vhk remind — 긴 세션 치명 규칙 재주입 (Fable 5 리마인더 시스템)
status: DONE
priority: P2
created: 2026-06-16
---

# Goal 68: vhk remind — 치명 규칙 재주입

> 출처: Fable 5 `long_conversation_reminder` 패턴. 긴 자율 루프·세션에서 컴팩션이 일어나면
> 치명 규칙이 증발한다. 매 N 턴마다 RULES.md에서 NON-NEGOTIABLE 섹션만 골라 재주입하면
> 1번째 턴과 100번째 턴이 같은 가중치를 가진다.
> ⚠️ **기안 단계(NOT_STARTED)** — 카드만.

## The Goal

`vhk remind`가 `.vhk/remind.md`를 생성 — RULES.md의 치명 규칙(NON-NEGOTIABLE) 섹션만
골라 최소 포맷으로 압축 출력. 루프가 매 N 턴에 이 파일을 컨텍스트에 재주입.

## 차별점 (loop-brief·context --compact와 다른 축)

| | `vhk remind` | `vhk loop-brief` | `vhk context --compact` |
|---|---|---|---|
| 목적 | **치명 규칙 가중치 유지** | 1틱 의도 고정 | 환경 파악 |
| 내용 | NON-NEGOTIABLE만 | 의도+goal1+교훈+STOP | 스택+메모리+goal+참조 |
| 시점 | 매 N 턴 삽입 | 매 틱 시작 | 세션 시작 |
| 비유 | Fable 5 리마인더 | Ralph PROMPT.md | 온보딩 문서 |

## 동작 (착수 시)

1. RULES.md에서 `## NON-NEGOTIABLE` 또는 `## 절대 규칙` 헤더 아래 항목만 추출
2. `치명: ` 접두 + 불릿 목록으로 압축 (원문 보존 아닌 핵심만)
3. `.vhk/remind.md` 파일로 저장 (loop-brief 사이드카)
4. `printNextStep`: `/loop N/remind` 패턴 안내

재사용: RULES.md 파싱은 `sync.ts`의 파싱 헬퍼 활용.

## Completion Check (착수 후)

- [ ] `_meta` 모든 게이트 통과
- [ ] RULES.md NON-NEGOTIABLE 섹션 추출 + `.vhk/remind.md` 생성
- [ ] RULES.md 없을 때 graceful (빈 섹션, 크래시 0)
- [ ] 4지점 등록(index.ts + command-registry + nlp-router + COMMANDS.md)
- [ ] MCP 등록 (읽기 전용, `runVhkCli`)

## Forbidden Actions (OUT)

- RULES.md 자체 수정 금지 (읽기 전용)
- loop-brief 포맷 변경 금지 (독립 명령)
- 기존 tool API 시그니처 변경 0
