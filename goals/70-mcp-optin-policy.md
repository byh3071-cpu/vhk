---
vhk_format: 1
type: goal
id: 70
title: MCP high-risk 도구 옵트인 정책 명문화 (deploy·publish류 명시 선택 강제)
status: NOT_STARTED
priority: P2
created: 2026-06-16
---

# Goal 70: MCP high-risk 도구 옵트인 정책

> 출처: Fable 5 MCP 옵트인 패턴 — 위험 도구는 명시 선택 전 호출 금지.
> 현재 vhk MCP(`src/mcp/server.ts`) 는 모든 도구를 동등하게 노출.
> deploy·publish·delete류 고위험 도구에 별도 게이트 없음.
> PAT-003(되돌릴 수 없는 작업 4중 안전장치)과 연결.
> ⚠️ **기안 단계(NOT_STARTED)** — 카드만.

## The Goal

MCP 도구에 `risk_level: 'high'` 메타데이터 + 호출 전 옵트인 확인 레이어.
`confirm: true` capability gate 패턴(goal71 MCP1 `inject_core_rules` 와 동일 사상).

## 고위험 도구 후보

- publish류 (npm 발행, git push to main)
- delete류 (파일 삭제, DB 삭제)
- deploy류 (서버 배포, 클라우드 리소스)
- external API write (외부 서비스 쓰기)

## 핵심 설계

1. `src/mcp/server.ts` 도구 등록에 `risk_level` 필드 추가
2. `high` 도구: 호출 파라미터에 `confirm: true` 없으면 dry-run 결과만 반환
3. RULES.md init 템플릿에 MCP 옵트인 정책 섹션 추가
4. docs/adr/ ADR로 정책 결정 기록

## Completion Check (착수 후)

- [ ] `_meta` 모든 게이트 통과
- [ ] `risk_level` 필드 도구 등록 + `confirm: true` gate 패턴
- [ ] 기존 low-risk 도구 동작 무손상 (GA 안정성)
- [ ] ADR 작성
- [ ] init RULES.md 템플릿 MCP 옵트인 섹션

## Forbidden Actions (OUT)

- 기존 tool API 시그니처 변경 0 (GA 안정성)
- MCP 모드에서 inquirer 프롬프트 호출 금지 (TTY 없음)
- PAT-003 4중 안전장치 우회 금지
