---
vhk_format: 1
type: goal
id: 49
title: 정적 린트 게이트 — Biome 도입 + CI 블로킹 — P1
status: NOT_STARTED
priority: P1
created: 2026-06-08
leads_to: 툴링 4→5 · 린트 고유 결함 자동 차단
---

# Goal 49: 정적 린트 게이트(Biome)

> 출처: RFC 0048 §2 원리1 · 13-에이전트 감사(2026-06-08) 툴링 차원 high.

## 근거 (실측)
- 정적 린트 툴 전무 — 루트에 `eslint`/`prettier`/`biome` 설정 0개(node_modules 전이 설정만), `ci.yml`에 lint 스텝 없음.
- strict TS + 커스텀 가드(raw-json-parse·stray·secure)가 일부 메우나 `no-floating-promises`·exhaustive switch·미사용 변수 같은 린트 고유 룰은 빈다.
- 131파일 규모에서 이 계층을 사람 리뷰에만 의존 = 시니어 기준 미달.

## 동작
- Biome 1개 도입(eslint+prettier 통합, 설정 1파일, 빠름) — `biome.json`에 `recommended` + `noFloatingPromises` 등 진짜 결함 룰 우선(스타일 통일은 부차).
- `ci.yml`에 `pnpm exec biome ci .` 블로킹 스텝 추가.
- 기존 위반은 1회 베이스라인 커밋(또는 자동 포맷)으로 정리.
- 핵심: floating promise·switch 누락 같은 **결함**을 자동 차단하는 것이 목표.

## 수용 기준
- biome 설정 1파일 존재, CI lint 위반 0으로 green, 위반 시 머지 차단 동작.

## Completion Check
- [ ] biome.json (recommended + noFloatingPromises) 추가
- [ ] 기존 위반 1회 베이스라인 정리
- [ ] ci.yml에 biome ci 블로킹 스텝
- [ ] 공통 게이트 통과, 회귀 0
- [ ] check-goal-49.mjs 통과

## Mandatory Reading
- .github/workflows/ci.yml · package.json(devDeps) · src/mcp/server.ts(eslint-disable 1곳)
