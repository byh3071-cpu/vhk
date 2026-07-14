---
vhk_format: 1
type: goal
id: 65
title: pre-commit L2 기록 집행 — 조건부(우회 실측 시에만 착수) — P2
status: DONE
priority: P2
created: 2026-06-11
leads_to: 기록 집행 우회 경로 0 (ADR-001 L2 트리거 이행)
---

# Goal 65: L2 기록 집행 커밋훅 — DONE (2026-07-14)

> ✅ **완료(2026-07-14)**: RFC 0061 record-net 을 vhk 레포에 자가적용 = commit-msg 훅(`.githooks/commit-msg`
> → `check-records.mjs --commit-msg-file`). git 이 실행하는 훅이라 커밋 "행위"에 바인딩 → 명령 문자열
> 파싱 불요·우회 3경로 전부 커버. 활성 = `pnpm run hooks:install`(core.hooksPath).
>
> **착수 트리거 충족**: 경로 3(다른 에이전트)이 Cursor 트리거 온보딩(#504)으로 구체화 +
> 경로 2(worktree cwd 불일치)는 check-records 헤더에 명기된 기존 한계. 포렌식 git-log 히트가 아니라
> **아키텍처 트리거**(멀티에이전트 우회가 실체화)로 착수 — 정직히 기록.
>
> **pre-commit 아닌 commit-msg 선택**: 카드 원안은 pre-commit 이었으나, [skip-record] 판정은 커밋
> 메시지 접근이 필요한데 pre-commit 은 메시지를 못 봄 → commit-msg 가 정답(RFC 0061 동일 결론).
>
> 원 기안 본문 ↓ (append-only 보존).

---

# Goal 65: pre-commit L2 (조건부 — 지금 착수 금지)

> 출처: ADR-001(기록 집행 hook) §결과 — 알려진 우회 3종과 "실측되면 L2 추가" 트리거.
> ⚠️ **착수 조건 미충족 상태로 기안만** — 과안정화 경계(우회가 실제 일어나는지 모르는데
> 이중 장치부터 달면 비용만 큼). 조건 충족 전 status 를 IN_PROGRESS 로 올리지 말 것.

## 착수 트리거 (하나라도 실측되면 착수)

dev log 없는 실질 코드변경 커밋이 다음 경로로 main/브랜치에 들어온 것이 확인될 때:

1. `vhk save`·MCP save tool 경유 (명령 문자열에 git 없음 — 토크나이저 미감지)
2. 세션이 다른 워크트리로 cd 한 뒤의 커밋 (hook 이 세션 시작 cwd 기준 평가)
3. 터미널 직접 커밋 / 다른 에이전트(Cursor 등)

판정 방법: `git log --diff-filter=AM -- src scripts` 에서 동일 커밋에 docs/log 변경이
없는 코드 커밋([skip-record] 메시지 제외)을 주기 점검 — 발견 즉시 이 goal 착수.

## 동작 (착수 시)

- git pre-commit hook — 커밋 "행위"에 바인딩이라 명령 문자열 파싱 불요·전 경로 커버.
  check-records.mjs 의 evaluateRecords 순수부 재사용(staged 만 보면 됨 — add 체인
  휴리스틱도 불필요해짐).
- 설치: husky 미도입 — `core.hooksPath` 또는 vhk doctor/init 이 .git/hooks 에 심기
  (클론마다 자동, vhk 가 스캐폴드 CLI 라는 ADR-001 논거 활용).
- 사람 커밋 배려: 메시지 [skip-record] 동일 우회 + 안내 메시지 한국어.

## Completion Check (착수 후)

- [x] 트리거: 경로 3(다른 에이전트)이 Cursor 온보딩(#504)으로 구체화 + 경로 2(worktree cwd) 기존 한계 — 아키텍처 트리거로 착수(정직 기록, 포렌식 히트 아님)
- [x] 우회 3경로 커버: commit-msg 는 커밋 행위 바인딩이라 vhk save·worktree cwd·타에이전트 전부 git 이 실행 → 차단. [skip-record] 통과 실 git 훅 E2E 확인
- [x] L1(PreToolUse)+L2 이중 발동 UX: Claude 는 L1 이 먼저 차단, 통과 시 L2 는 로그 존재로 재통과 → 실사용 중복 차단 없음(백스톱). dev log 명시

## 경계 (OUT)

- 트리거 충족 전 구현 금지 · husky 등 신규 의존성 도입 금지.
