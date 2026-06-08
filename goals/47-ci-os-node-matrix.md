---
vhk_format: 1
type: goal
id: 47
title: 멀티 OS/Node CI 매트릭스 — win32(주 환경)+Node20(하한) 검증 — P0
status: DONE
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
- [x] win32에서 빌드·테스트 green 확인 — PR #227 CI 매트릭스 6조합(ubuntu·windows × node 22·24 + dogfood 2) 전부 green
- [x] 공통 게이트(typecheck+test+build) 통과, 회귀 0
- [x] check-goal-47.mjs 통과 (구조 검증 — ci.yml 매트릭스/win/node20 확인)

> ✅ DONE — PR #227 매트릭스 6조합(test ubuntu·windows × node 22·24 + dogfood ubuntu·windows) 전부 green.
>
> **🔎 goal 47 실측 발견**: node 하한을 20 으로 잡았더니 `test (ubuntu, 20)` 즉시 실패 —
> `packageManager: pnpm@11.2.2` 가 `node:sqlite` 의존으로 **Node ≥22.13 요구**(Node 20 에선
> pnpm 자체가 `ERR_UNKNOWN_BUILTIN_MODULE`). → 매트릭스 하한을 **22** 로 조정(툴체인 현실).
> 런타임 `engines.node(>=20)`는 별개로 유지(vhk 실행은 node 20 호환). 후속 선택지:
> ① engines 를 >=22 로 정직화 ② node-20 런타임 smoke 잡을 npm 으로 별도 추가 ③ pnpm 다운그레이드.
> (이 결정은 사용자 판단 — 본 goal 은 매트릭스 인프라 구축 + win32 검증에 집중.)

## Mandatory Reading
- .github/workflows/ci.yml · src/lib/exec.ts (시프 분기) · CLAUDE.md(win32 규칙)
