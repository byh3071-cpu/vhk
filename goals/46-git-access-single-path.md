---
vhk_format: 1
type: goal
id: 46
title: git-access 레이어 단일 통로화 — safeExecFile 통일 + 중복 함수 통합 — P2
status: DONE
priority: P2
created: 2026-06-07
completed: 2026-06-08
leads_to: git 호출 SoT 단일화 (회귀 0)
---

# Goal 46: git-access 레이어 단일 통로화

> 출처: VHK 핸드오프(2026-06-07, 실측) Task F. Goal 44·45의 선행(SHA 수집 통로 정리).

## 근거 (실측)
- git 접근이 3엔진 — `safeExecFile`(exec.ts) / `execFileSync('git',…)` 직접(git-repo.ts, 우회) / `simple-git`(git.ts).
- 중복: "커밋 있나?" = `hasAnyCommits`(simple-git) vs `countLocalCommits`(execFileSync); "레포냐?" = `isGitRepo`(simple-git) vs `getGitRoot`(execFileSync). 에러 컨벤션 4종.

## 동작
- git-repo.ts 직접 `execFileSync('git',…)`를 `safeExecFile` 경유로 통일(timeout 백스톱·에러 일관성).
- 커밋 존재/레포 감지 중복을 함수 하나로 통합.
- `simple-git` 유지(diff/log 파싱 편의) vs 제거(의존성 감소) 판단.
- git-porcelain.ts 순수 파서는 유지.

## 수용 기준
- git 호출이 단일 통로로 모이고 같은 질문에 함수 하나만 남는다. 회귀 0.

## Completion Check
- [x] git-repo.ts 직접 execFileSync → safeExecFile 통일
- [x] 커밋존재/레포감지 중복 함수 통합
- [x] simple-git 유지/제거 판단·반영
- [x] 회귀 테스트
- [x] check-goal-46.mjs 통과
- [x] 공통 게이트(typecheck+test+build) 통과, 회귀 0

## 결정 (실행 기록 2026-06-08)
- **safeExecFile = 단일 통로**: git-repo.ts 직접 `execFileSync('git',…)` 전부 제거 → `safeExecFile('git',…, {cwd, trimOutput})` 경유. exec.ts 에 `cwd`·`trimOutput`·(실패)`stderr` 가산. throw 계약 보존(실패 시 실제 git stderr 로 throw). diff.ts 는 이미 safeExecFile 사용이라 그대로.
- **중복 통합**: 레포/커밋 감지 SoT = git-repo `isGitRepo`/`hasCommits`(sync). git.ts 의 async `isGitRepo`/`hasAnyCommits` 는 이 둘로 위임(simple-git revparse 중복 제거).
- **simple-git = 유지**: diff/log 파싱 편의(getSessionDiff·getRecentCommits)에 계속 사용. 제거하면 recap/standup/today 재작성 필요 → 비용 과다, 이번 범위 밖.
- **follow-up(미반영)**: `src/mcp/server.ts` 의 로컬 `isGitRepo`(sync) 도 git-repo SoT 로 통합 권장하나, 열린 PR #195(fix/mcp)와 충돌 회피 위해 이번엔 건드리지 않음. #195 머지 후 별도 정리.

## Mandatory Reading
- src/lib/exec.ts · src/lib/git.ts · src/lib/git-repo.ts · src/lib/git-porcelain.ts
