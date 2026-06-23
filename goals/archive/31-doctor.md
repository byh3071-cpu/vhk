---
vhk_format: 1
type: goal
id: 31
title: vhk doctor — 개발 환경 정기검진(Node·pnpm·git·OS·VHK·MCP·audit) — P2
status: DONE
priority: P2
created: 2026-06-06
completed: 2026-06-07
---

# Goal 31: vhk doctor (환경 정기검진)

> 출처: Notion "D2 · vhk doctor 상세 설계 (환경 정기검진)".
> 개발 환경(머신) 자체가 건강한지 정기검진. preflight(Goal 29)가 '출고물 점검'이라면 doctor는 '몸 건강검진'.
>
> ⚠️ **기존 코드 주의**: `src/commands/doctor.ts`가 이미 존재한다. 이 goal = 기존 doctor를 7개 항목 진단으로 확장하는 작업. 착수 시점에 main의 doctor.ts 상태(미커밋 변경 가능)를 먼저 동기화·확인할 것.

## 배경 (왜)
- preflight = 이번에 내보낼 변경물 / doctor = 머신/환경 자체.
- 새 PC·새 worktree 셋업 후 "환경 제대로 됐나?", 갑자기 뭔가 안 될 때 원인 좁히기, 주 1회 정기 점검.

## 철학
① 진단만 — 자동 수정 X(환경 손상 방지) ② CVE = 하이브리드: 평소 내장 '권장 최소 버전' 기준 오프라인·즉시 판정, `--online`(또는 인터넷 있을 때)만 실제 취약점 DB 조회 후 `~/.vhk`에 24h 캐시 ③ audit = 기본 제외(가볍게 유지), 정확히 필요한 3시점만 — publish 직전 / `pnpm install` 직후 / 월 1회 ④ MCP 핑은 짧은 timeout으로 격리(전체 안 멈춤) ⑤ safeExecFile.

## 동작 (7개 진단 항목)
- Node: 버전 + 내장 기준 판정(`--online` 시 실제 CVE 보정·24h 캐시)
- 패키지 매니저: pnpm/npm 버전·권장 충족 / git: 버전·user.name·user.email·기본 브랜치
- OS·셸: Windows 11 / PowerShell 확인 / VHK 설치: 전역 무결성·버전·`~/.vhk` 글로벌 상태
- MCP: 29개를 2초 timeout 병렬 핑, 막힌 건 "⚠️ 응답없음"만 표시(전체 안 멈춤)
- 의존성 보안: 기본 생략, `--audit`(또는 publish 전·의존성 변경 후)에만 `pnpm audit`
- 모듈 = `diagnostics/*.ts`(node·pnpm·git·os·vhk·mcp·audit), 결과 `{ name, status, value, advice }[]`, 항목마다 권장 조치 제시.

## Completion Check
- [ ] `vhk doctor`가 7개 항목 진단 후 사람이 읽을 리포트 출력
- [ ] 문제 항목마다 구체적 권장 조치(advice) 제시
- [ ] 자동 수정 경로 0건(진단만 — grep 확인)
- [ ] MCP 29개 병렬 핑이 막힌 도구에서 전체 멈추지 않음(timeout 격리)
- [ ] 각 diagnostic 모듈 vitest mock(버전/플랫폼 응답 시뮬레이션)
- [ ] vhk goal sync → check-goal-31.mjs → vhk goal check --id 31 통과
- [ ] 공통 게이트 통과 (typecheck + test + build), 기존 회귀 0

## 제외 범위 (v0)
- 자동 수정(환경 손상 방지로 의도 배제) / `vhk doctor --json` 외부 소비(Phase 3)

## Mandatory Reading
- src/commands/doctor.ts (기존 구현 — 확장 시작점, 미커밋 변경 확인)
- src/lib/exec.ts (safeExecFile)
- src/mcp/ (MCP 핑 대상 — 29개 도구)
