---
vhk_format: 1
type: goal
id: 46
title: git-access 레이어 단일 통로화 — safeExecFile 통일 + 중복 함수 통합 — P2
status: NOT_STARTED
priority: P2
created: 2026-06-07
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
- [ ] git-repo.ts 직접 execFileSync → safeExecFile 통일
- [ ] 커밋존재/레포감지 중복 함수 통합
- [ ] simple-git 유지/제거 판단·반영
- [ ] 회귀 테스트
- [ ] check-goal-46.mjs 통과
- [ ] 공통 게이트(typecheck+test+build) 통과, 회귀 0

## Mandatory Reading
- src/lib/exec.ts · src/lib/git.ts · src/lib/git-repo.ts · src/lib/git-porcelain.ts
