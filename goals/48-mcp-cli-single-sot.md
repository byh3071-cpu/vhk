---
vhk_format: 1
type: goal
id: 48
title: MCP↔CLI 단일 진실원 — git 인라인 재구현 제거, lib 순수함수 공유 — P0
status: NOT_STARTED
priority: P0
created: 2026-06-08
leads_to: 아키텍처 3→4 · 드리프트 버그(#150/#152/#161) 원천 제거
---

# Goal 48: MCP↔CLI 단일 진실원

> 출처: RFC 0048 §2 원리2 · 13-에이전트 감사(2026-06-08) 아키텍처 차원 유일 high.

## 근거 (실측)
- MCP가 CLI git 로직을 이중 구현. 29툴 중 16개만 `runVhkCli` 위임, save/undo/status/diff는 `src/mcp/server.ts`에서 git을 인라인 재구현:
  - status `server.ts:92,232` · add `:130` · commit `:134` · push `:139` · log `:174,249` · reset `:195` · branch `:229` · diff `:264-266,291`.
- 이 중복은 가설이 아니라 **실제로 #150/#152/#161 드리프트 버그를 출하**. 계약 테스트(`tests/mcp-cli-contract.test.ts`)는 사후 봉쇄일 뿐 구조적 중복 잔존.
- 이미 모범 사례 존재: `scanProjectForSecrets(cwd)`(`src/lib/scan-secrets.ts:48`)는 CLI·MCP가 같은 함수 호출. git도 동일하게.

## 동작
- 세션 git 동작(stage+commit, status 요약, soft-reset undo, diff 요약)을 `src/lib/`(예: `git-session.ts`) 순수함수로 추출 — `safeExecFile`·`git-repo.ts`(이미 `isGitRepo`/`hasCommits`/`getCommitInfo` SoT) 위에.
- CLI 명령(save/undo/status/diff)과 MCP 핸들러가 **동일 함수**를 호출하게 통일.
- 또는 비대화형 위임(`runVhkCli` + `--json`/`-m`)으로 단일 진실원화 — 둘 중 회귀 적은 쪽 판단.
- 계약 테스트로 단일화 후에도 #150/#152/#161 앵커 green 유지.

## 수용 기준
- 같은 git 질문에 구현 1개. MCP가 CLI 로직을 재구현하지 않는다. 계약 테스트 green, 회귀 0.

## Completion Check
- [ ] 세션 git 동작 lib 순수함수 추출 (또는 runVhkCli 위임으로 단일화)
- [ ] CLI·MCP가 동일 함수/경로 공유 (인라인 재구현 제거)
- [ ] tests/mcp-cli-contract.test.ts green (#150/#152/#161 앵커 유지)
- [ ] git-session 행동 테스트 추가
- [ ] 공통 게이트 통과, 회귀 0
- [ ] check-goal-48.mjs 통과

## Mandatory Reading
- src/mcp/server.ts · src/lib/scan-secrets.ts(공유 패턴) · src/lib/git-repo.ts · src/lib/exec.ts · tests/mcp-cli-contract.test.ts
