---
vhk_format: 1
type: goal
id: 48
title: MCP↔CLI 단일 진실원 — git 인라인 재구현 제거, lib 순수함수 공유 — P0
status: DONE
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
- [x] 세션 git 동작 lib 순수함수 추출 — `src/lib/git-session.ts` (safeExecFile 위, ExecResult 반환, cwd/raw 인지)
- [x] CLI·MCP가 동일 함수/경로 공유 — MCP server.ts 인라인 git 0건, CLI save/undo/status/diff 가 git-session 공유 (같은 질문=함수 하나)
- [x] tests/mcp-cli-contract.test.ts green (#150/#152/#161 앵커 유지, 도구 정확히 29개)
- [x] git-session 행동 테스트 추가 — tests/git-session.test.ts (17 케이스: argv·cwd·trim·okOut)
- [x] 공통 게이트 통과, 회귀 0 (typecheck/build/test green, 1295 pass)
- [x] check-goal-48.mjs 통과 (goal 고유 검증 22항)

## 구현 메모

- 설계 선택: **option 1(lib 순수함수 추출)** 채택 — option 2(runVhkCli 위임)는 save/undo/status/diff MCP 출력 포맷이 바뀌어 회귀↑.
- MCP server.ts: save/undo/status/diff + ship/recap/doctor 의 git 호출 전부 `gitSession.*` 경유. 로컬 `isGitRepo()` 재정의 제거 → `git-repo.isGitRepo`(Goal 46 sync SoT) import.
- 부수 개선: MCP status/save/ship 가 statusPorcelain raw(선행 공백 보존)를 `.filter(Boolean)` 로 파싱 → 첫 줄 오집계(잠재 버그) 제거, CLI 와 파싱 통일.
- git-session 은 throw 안 함(ExecResult) → MCP(.ok 검사)·CLI(save 의 `must()` throw 승격) 양쪽 자연 소비.

## Mandatory Reading
- src/mcp/server.ts · src/lib/scan-secrets.ts(공유 패턴) · src/lib/git-repo.ts · src/lib/exec.ts · tests/mcp-cli-contract.test.ts
