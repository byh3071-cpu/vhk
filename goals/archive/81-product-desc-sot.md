---
vhk_format: 1
type: goal
id: 81
title: 제품 설명 단일 SoT — package.json.description 주입 — P1
status: DONE
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

## 선조사 범위 재조정 (2026-06-22, goal 79 선례 "확실한 것만")
> 카드 전제("brief 가 설명 하드코딩")가 코드와 어긋나 재조정.
- **brief.ts 는 설명 하드코딩 안 함** — `readProjectIdentity()` 로 RULES.md "한 줄 설명" → `package.json.description` 폴백 순으로 읽는다(VHK-004 의도). brief 를 package.json 으로 **강제하면 유저 프로젝트의 문서-우선 SoT(VHK-004)가 깨짐** → 건드리지 않음.
- 전수 grep 결과 **진짜 SoT 위반 1곳**: `index.ts` `.description('VHK — AI 코딩 세션을…')` = `package.json.description` 의 하드코딩 복제(드리프트 위험). → 이것만 고친다.
- 나머지 "설명" 문자열은 **브랜드 태그라인**(다른 층위, 유지): `index.ts` 메뉴 헤더 "바이브코딩 프로젝트 코치" · RULES.md "한 줄 설명" · core-ruleset role · gate.ts hint 예시.

## 동작 (재조정 후)
- `getVhkDescription()`(version.ts, `getVhkVersion` 동형) 추가 → `index.ts .description(getVhkDescription())` 런타임 주입 = 하드코딩 복제 **구조적** 제거(드리프트 원천 차단).
- 태그라인(메뉴 헤더)은 "브랜드 태그라인 ≠ npm 제품 설명" 의도 주석으로 명문화.

## 수용 기준
- 제품 설명이 단일 출처(`package.json.description`)에서 온다. index.ts ↔ package 설명 복제 0. 회귀 0.

## Completion Check (작은 단위)
- [x] index.ts `.description` 하드코딩 복제 → `getVhkDescription()` 런타임 주입(package.json.description SoT)
- [x] 설명 하드코딩 전수 grep(src 전역) → 제품설명 1곳 정리 + 태그라인은 "≠ 제품설명" 의도 명문화
- [x] (택1 선택) **런타임 주입**으로 드리프트 구조적 차단 — version.ts getVhkVersion 동형(근거: 빌드주입보다 단순·dist/src 양쪽 동작)
- [x] 회귀 테스트(getVhkDescription = package.description 단언 + index.ts 하드코딩 복제 금지 가드)
- [x] check-goal-81.mjs
- [x] 공통 게이트 통과, 회귀 0
- [~] brief↔package "불일치"는 RULES.md 태그라인 vs package 설명 = VHK-004 의도된 층위차 → 변경 안 함(문서화로 종결)

## Forbidden Actions (OUT)
- `package.json.description` 자체 임의 변경 0 (그것이 SoT — 바꾸려면 별도 product 결정)
- 본질(한국어 우선) 훼손 0 (RFC 0048 §1 — 영어화는 비목표)
- 기존 메뉴/CLI 출력 breaking 변경 0

## Mandatory Reading
- src/commands/brief.ts · src/index.ts(메뉴 헤더) · package.json
- goals/54-product-meta-sot.md(버전 SoT 패턴) · tests/version-sync.test.ts
