---
vhk_format: 1
type: goal
id: 17
title: vhk mission — Mission Contract (scope/intent 층) — P3
status: NOT_STARTED
priority: P3
version: v1.9.0
---

# Goal 17: vhk mission (Mission Contract v0)

> 출처: Trust Loop 배치 7. scope/intent 층 (mission → verify → review). 전제: verify(Goal 13)·review(Goal 15) 완료.
> 작업의 목표·허용범위·금지선을 계약으로 선언하고, 현재 변경이 계약 안인지 검증한다.

## 배경
verify 는 게이트 통과를, review 는 거짓완료를 본다. 하지만 "이 변경이 애초에 하기로 한 범위 안인가?"는 아무도 안 본다. mission 은 작업 전 **계약(목표·허용 glob·금지 glob)** 을 선언하고, 변경 파일이 계약을 벗어나는지(scope 밖 경고 / forbidden 위반) 검증하는 scope 가드.

## 철학
① 계약 먼저 — 무엇을 할지/안 할지 명시 ② 경로 glob 기준 v0 — 의미 검증 아님(정직한 한계 disclaimer) ③ 신뢰도 신호지 하드블록 아님(strict 연동은 후속) ④ 별도 네임스페이스 — latest.json(verify 증거) 안 건드림.

## 동작 (파일·계약)
- 저장 `.vhk/mission.json`: `{ schemaVersion:1, objective, scope:string[](허용 glob), forbidden:string[](금지 glob), createdAt, updatedAt }`. BOM-safe `readJsonFile` 읽기.
- `vhk mission set` — 계약 선언/갱신. `--objective`/`--scope`(반복)/`--forbidden`(반복) + 대화형 fallback(비-TTY 가드, `--yes`).
- `vhk mission` (기본) — 현재 계약 표시. 없으면 안내 + exit 1.
- `vhk mission check` — git 변경파일(working tree + staged) ↔ scope/forbidden glob 교차검증. forbidden 매칭=위반(강, exit 1), scope 밖=경고.
- `vhk mission clear` — 계약 삭제.
- 자체 glob→RegExp(외부 의존 0), secret 미포함(경로·objective 텍스트만), 크로스플랫폼.

## Completion Check
- [ ] vhk mission set → .vhk/mission.json 생성/갱신 (schema v1, BOM-safe)
- [ ] vhk mission (기본) → 계약 표시, 없으면 안내 + exit 1
- [ ] vhk mission check → forbidden 매칭=위반(exit 1) / scope 밖=경고 (순수 checkMission 회귀 가드)
- [ ] vhk mission clear → mission.json 삭제
- [ ] 판정에 "경로 glob 기준 — objective 의미 검증 아님" disclaimer 명시
- [ ] mission.json 별도 네임스페이스 — latest.json(verify 증거) 불변
- [ ] 자연어/commander 양 경로 동작 (mission/미션) + secret 누출 0 (vhk secure scan)
- [ ] vhk goal sync → check-goal-17.mjs 생성 → vhk goal check --id 17 통과
- [ ] 공통 게이트 통과 (typecheck + test + build + secure), 기존 회귀 0

## 제외 범위
- objective 의미 검증(자연어 부합) → v0 밖
- forbidden 액션 금지(safety-mode/risk-policy 와 중복) → v0 제외, 경로 glob만
- strict mode 하드블록 연동 → 후속
- git diff 의미 분석 → v0 밖(경로 매칭만)

## Mandatory Reading
- src/commands/verify.ts / review.ts (latest.json·판정 패턴 — disclaimer/exit 정책)
- src/lib/read-json.ts (readJsonFile/stripBom), src/lib/interactive.ts (isInteractive/promptOrDefault)
- simple-git status (변경파일 수집), src/lib/git.ts (기존 사용 패턴)
