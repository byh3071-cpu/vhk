---
vhk_format: 1
type: goal
id: 42
title: 릴리즈 준비 게이트 자동화 — CHANGELOG 본문/Unreleased 모순 차단 — P0
status: DONE
priority: P0
created: 2026-06-07
completed: 2026-06-08
leads_to: 빈 본문 릴리즈 차단 (자기게이트 자동화)
---

# Goal 42: 릴리즈 준비 게이트 자동화

> 출처: VHK 핸드오프(2026-06-07, 실측) Task A. VHK가 자기 철학("게이트 통과 전 done 금지")을
> 자기 자신한테 강제하게 만드는 작업의 P0. v2.4.0이 CHANGELOG 본문 빈칸인 채 버전만 올라간 드리프트가 동기.

## 근거 (실측)
- `release.yml`은 태그 push **후** 게시 전용이라 거기서 막으면 늦다(태그가 이미 생성됨).
- `check-goal-*.mjs`는 CI 미연결(주석 "릴리즈 전·수동"). → 본문 빈 채 버전 올려도 막는 게 없음(v2.4.0 빈칸 사고).

## 동작 (설계 후보)
- (권장) `vhk publish` 흐름에서 **태그 push 직전** release-readiness 게이트 호출, 또는
- `ci.yml`에 버전 상승 감지 스텝 추가(main 푸시 시 검사).
- fail(비0 종료) 조건:
  1. `## [<현재 package.json version>]` 섹션이 비었거나 플레이스홀더("작성 필요" 등).
  2. `[Unreleased]`가 안 빈데 새 버전 본문이 빈 모순 상태.
  3. (선택) footer에 `[<version>]` 비교 링크 없음.

## 수용 기준
- 본문 빈 채 버전 올리면 CI/publish가 빨간불로 막는다. 통과 시 자동 GitHub Release 노트 정상 생성.
- 본문 빈 버전 케이스가 게이트에서 fail하는 회귀 테스트 포함.

## Completion Check
- [x] release-readiness 게이트 구현(publish 흐름 또는 ci.yml 스텝)
- [x] CHANGELOG 본문 빈/플레이스홀더 fail
- [x] Unreleased↔새 버전 본문 모순 fail
- [x] 본문 빈 버전 케이스 회귀 테스트
- [x] check-goal-42.mjs 통과
- [x] 공통 게이트(typecheck+test+build) 통과, 회귀 0

## Mandatory Reading
- src/commands/publish.ts
- .github/workflows/ci.yml · .github/workflows/release.yml
- CHANGELOG.md
