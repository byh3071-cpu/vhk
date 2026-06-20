---
vhk_format: 1
type: goal
id: 81
title: 제품 설명 단일 SoT — package.json.description 주입 — P1
status: NOT_STARTED
priority: P1
created: 2026-06-20
leads_to: 제품 설명 드리프트 0 (G54 버전 SoT의 설명판 보완)
---

# Goal 81: 제품 설명 단일 SoT

> 출처: RFC 0053 §4(D8). 도그푸딩 감사 [D8]. Goal 54(버전 SoT)가 안 다룬 *설명* 사각지대.

## 근거 (실측)
- `vhk brief` 제품 설명 = "바이브코딩 풀사이클 CLI".
- `package.json.description` = "VHK — AI 코딩 세션을 목표·증거·기억·규칙으로 묶는 한국어 CLI…".
- 둘이 다름 = 설명이 두 곳에 하드코딩. Goal 54는 *버전* 드리프트만 SoT화했고 *설명*은 가드 밖.

## 동작
- 제품 설명을 `package.json.description` **단일 SoT**에서 주입(brief 등 하드코딩 제거).
- 다른 설명 하드코딩 지점(index.ts 메뉴 헤더 "바이브코딩 프로젝트 코치" 등) grep·정리 또는 의도 구분(브랜드 태그라인 vs 제품 설명).
- version-sync 패턴 확장(설명 드리프트 가드) 또는 런타임 주입으로 드리프트 구조적 차단.

## 수용 기준
- 제품 설명이 단일 출처에서 온다. brief↔package 설명 불일치 0. 회귀 0.

## Completion Check (작은 단위)
- [ ] brief.ts(또는 brief 생성기) 제품 설명 하드코딩 → `package.json.description` 주입
- [ ] 설명 하드코딩 전수 grep(src 전역) → 정리 or "태그라인 ≠ 제품설명" 의도 명문화
- [ ] (택1) version-sync.test 설명 케이스 추가 / 런타임 주입으로 가드 불필요화 — 선택 근거 기록
- [ ] 회귀 테스트(brief 설명 = package.description 단언)
- [ ] check-goal-81.mjs
- [ ] 공통 게이트 통과, 회귀 0

## Forbidden Actions (OUT)
- `package.json.description` 자체 임의 변경 0 (그것이 SoT — 바꾸려면 별도 product 결정)
- 본질(한국어 우선) 훼손 0 (RFC 0048 §1 — 영어화는 비목표)
- 기존 메뉴/CLI 출력 breaking 변경 0

## Mandatory Reading
- src/commands/brief.ts · src/index.ts(메뉴 헤더) · package.json
- goals/54-product-meta-sot.md(버전 SoT 패턴) · tests/version-sync.test.ts
