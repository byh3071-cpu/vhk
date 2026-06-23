---
vhk_format: 1
type: goal
id: 29
title: vhk preflight — 출고 전 안전점검 (publish/PR 직전 일괄 점검) — P1
status: DONE
priority: P1
created: 2026-06-06
completed: 2026-06-07
leads_to: goal-30-worktree
---

# Goal 29: vhk preflight

> 출처: Notion "D1 · vhk preflight 상세 설계 (출고 전 안전점검)". 전제: vhk secure / safeExecFile / publish 가드(#119).
> publish·PR 직전 사고 날 만한 곳을 한 번에 점검하는 안전점검 명령어 — 비행기 이륙 전 체크리스트.

## 배경 (왜 — 상상이 아니라 Dev Log에 기록된 실제 고통)
- npm publish 2FA 막힘 (실제 발생)
- Windows `.cmd` shim 취약점 (Node 20.12+ CVE)
- git worktree env 누락 사고
- React19 lint 깨짐
→ `vhk preflight` 한 번으로 2FA·shim·worktree env·lint·테스트를 자동 점검하고 🟢/🔴로 알린다.

## 철학
① 치명 실패(🔴)는 무조건 차단 — `--force` 같은 우회 없음(사고 원천 봉쇄) ② 외부 명령은 `safeExecFile`만(execSync 금지 — 불변규칙) ③ 5초 내 완료 목표(테스트는 캐시/스킵) ④ 심각도 분리로 거짓양성 완화 ⑤ MCP 노출.

## 동작 (명령·항목)
- `vhk preflight` 전체 점검(읽기 전용) / `--publish` 2FA·버전 포함 / `--pr` lint·테스트·한 PR 한 goal / `--fix` 자동수정(Phase 2).
- 8개 점검 항목 + 심각도:
  - 🟠 npm 로그인 + 2FA 리마인드(`npm whoami`) / 🟠 shim 안전성(Node ≥ 20.12)
  - 🔴 worktree env(필수 키 = `.env.example` 기준) / 🔴 lint(eslint) / 🔴 typecheck(`tsc --noEmit`) / 🔴 테스트
  - 🟡 git 청결(uncommitted 없음) / 🟡 브랜치 규칙(main 직접 아님 · 한 PR 한 goal)
- 테스트 범위: 기본 `vitest --changed`(통과분 캐시 스킵, 변경 시 자동 재실행) / `--full` 전체.
- 치명(🔴) 실패 시 HARD_STOP(exit 1)로 publish/PR 차단.
- 각 검사 = `checks/*.ts` 모듈(2fa·shim·worktree·lint…), 결과 객체 `{ name, status, detail, severity }[]`.

## Completion Check
- [ ] `vhk preflight --publish`가 8개 항목 점검 후 정확한 exit code 반환
- [ ] 치명(🔴) 1개라도 있으면 publish 차단(`--force` 우회 없음)
- [ ] 외부 명령 전부 `safeExecFile`(execSync 0건)
- [ ] 각 check 모듈 vitest 단위 테스트(성공/실패/경고 mock)
- [ ] vhk goal sync → check-goal-29.mjs → vhk goal check --id 29 통과
- [ ] 공통 게이트 통과 (typecheck + test + build), 기존 회귀 0

## 제외 범위 (v0)
- `--fix` 자동수정(Phase 2) / git hook·publish 파이프라인 내장(Phase 3)

## 공유 모듈 메모
- worktree env 점검 로직 = `worktree-env` 모듈로 분리 → **Goal 30(worktree 가드)이 동일 모듈 재사용**. 이중 구현 금지.

## Mandatory Reading
- src/lib/exec.ts (safeExecFile 계약 — execSync 금지)
- src/commands/publish.ts (publish 가드 #119 연계 지점)
- src/commands/verify.ts (테스트/리포트 선례 — Goal 13)
- goals/_meta.md (공통 게이트 = typecheck/test/build)
