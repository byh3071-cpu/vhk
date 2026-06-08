---
vhk_format: 1
type: goal
id: 47
title: 멀티 OS/Node CI 매트릭스 — win32(주 환경)+Node20(하한) 검증 — P0
status: IN_PROGRESS
priority: P0
created: 2026-06-08
leads_to: 툴링 3→4 · 주 사용환경 회귀 봉쇄
---

# Goal 47: 멀티 OS/Node CI 매트릭스

> 출처: RFC 0048 §2 원리5 · 13-에이전트 감사(2026-06-08) 툴링 차원 high.

## 근거 (실측)
- CI는 `ubuntu-latest` + Node 24 단일(`.github/workflows/ci.yml:11,20-23`, dogfood 잡 동일).
- 그런데 주 사용·배포 환경은 **win32** — `src/lib/exec.ts`에 cmd.exe `.cmd` 시프 분기 코드(CVE-2024-27980 회피)가 실재하고, PowerShell UTF-8 BOM 함정(#92)을 이미 겪음.
- engines는 `node>=20`인데 하한 Node 20도 CI에서 한 번도 안 돈다. → 가장 아픈 결격(타깃 환경 미검증).

## 동작
- `ci.yml` test 잡에 `strategy.matrix` 추가: `os: [ubuntu-latest, windows-latest]`, `node: [20, 24]`, `runs-on: ${{ matrix.os }}`.
- dogfood 잡도 최소 windows-latest 1종 포함(win32 서브커맨드 라우팅·경로 실검증).
- Windows 셸에서 `pnpm test:run`·`pnpm build` 동작 확인(pnpm action-setup 호환).
- 실패 시 머지 차단(블로킹 유지).

## 수용 기준
- win32+Node20 조합에서 전 테스트·도그푸딩 green. 매트릭스 4조합 모두 통과. 회귀 0.

## Completion Check
- [x] ci.yml test 잡 matrix(os 2 × node 2) 추가
- [x] dogfood 잡 windows-latest 포함 (+ shell: bash 로 win32 ::group:: 호환)
- [ ] win32에서 빌드·테스트 green 확인(Actions 로그) — PR CI 매트릭스 통과 후 체크
- [x] 공통 게이트(typecheck+test+build) 통과, 회귀 0
- [x] check-goal-47.mjs 통과 (구조 검증 — ci.yml 매트릭스/win/node20 확인)

> ⏳ 상태 IN_PROGRESS — 코드/구조 게이트는 통과. 매트릭스 4조합(ubuntu·windows × node 20·24) +
> dogfood 2조합이 PR CI 에서 전부 green 확인되면 status: DONE + 위 박스 체크.

## Mandatory Reading
- .github/workflows/ci.yml · src/lib/exec.ts (시프 분기) · CLAUDE.md(win32 규칙)
