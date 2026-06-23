---
vhk_format: 1
type: goal
id: 32
title: vhk standup — 아침 브리핑(어제 한 일 + 오늘 할 일) — P2
status: DONE
priority: P2
completed: 2026-06-07
created: 2026-06-06
leads_to: goal-33-today
---

# Goal 32: vhk standup (아침 브리핑)

> 출처: Notion "B3 · vhk standup 상세 설계 (아침 브리핑)".
> 아침에 `vhk standup` 한 번이면 어제 한 일 + 오늘 할 일을 자동 브리핑. 혼자 일하는 1인기업의 데일리 스탠드업.

## 배경 (왜)
- 어제 커밋·Dev Log·완료 goal을 요약하고, 오늘 추천 goal과 미해결 항목을 보여준다.
- 생활 패턴 분석(Dev Log 실제 작업 시각): 이른 아침 루틴이 거의 없고 오후~심야 집중 → '시계'가 아니라 '첫 터미널 여는 순간'에 반응해야 적중.

## 철학
① '어제' 기준 = 마지막 활동일(주말·공백 건너뜀 — 불규칙 일정에 맞춤) ② 실행 핵심 앵커 = 터미널 자동실행, 텔레그램 고정시각 푸시는 라이프스타일 확인 후 선택 실험(Phase 3) ③ 오늘 추천 v0 = 단순 나열 + 막힌 것 표시(우선순위 고도화는 나중) ④ **daily 모듈을 Goal 33(today)과 공유**(회고 vs 전망) ⑤ git log는 safeExecFile.

## 동작 (데이터 소스 3개 병합)
- Dev Log 데이터소스: 어제 실행 기록·결과·교훈 (날짜 필터 쿼리, 어제 00:00~24:00)
- git log: 어제 커밋 요약 (safeExecFile)
- VHK goals: 다음 NOT_STARTED goal, 진행 중(IN_PROGRESS)
- 출력 = 📌 어제 한 일 / 🎯 오늘 추천(NOT_STARTED 나열 + 막힌 것) / ⚠️ 미해결. 사람이 읽기 좋은 섹션 포맷.
- `standup.ts`가 3개 소스 병합.

## Completion Check
- [ ] `vhk standup`이 어제 요약 + 오늘 추천을 한 화면에 출력
- [ ] '어제' = 마지막 활동일(주말·공백 skip) 정확 계산
- [ ] git log·goal 상태·(Phase 2)Dev Log 병합, 빈 Dev Log는 git log로 보완
- [ ] daily 모듈을 Goal 33과 공유 가능한 구조(범위 필터 주입식)
- [ ] 날짜 필터/병합 로직 vitest mock
- [ ] vhk goal sync → check-goal-32.mjs → vhk goal check --id 32 통과
- [ ] 공통 게이트 통과 (typecheck + test + build), 기존 회귀 0

## Phase 3 — 자동실행 앵커 (완료)
- `vhk standup --if-stale` — 오늘 아직 안 봤을 때만 출력(KST 자정 기준). 상태 = `~/.vhk/daily-shown.json`(version-check 캐시와 동급 글로벌). 순수 `shouldShow(lastShown, today)` + IO 분리.
- `vhk standup --install-anchor` — 셸 rc(`~/.bashrc`·`~/.zshrc`·PowerShell `$PROFILE`)에 붙여넣을 줄을 **출력만** 함. ⚠️ rc 자동수정 절대 X(사람이 직접 붙여넣기).
- 상태 헬퍼는 generic(`standup`/`today` 키) → Goal 33 today 자동실행이 후속에서 재사용.
- 게이트: check-goal-32 Phase 3 검증 추가 · shown-state/anchor 단위테스트 + standup-anchor e2e.

## 제외 범위 (v0)
- 우선순위 추천 고도화 / 텔레그램 아침 푸시 알림(별도·선택 — 만들지 않음)
- `today --if-stale` 자동실행(Goal 33 후속 PR로 분리)

## 공유 모듈 메모
- 날짜 범위 필터·소스 병합 = `daily` 모듈로 분리 → **Goal 33(today)이 today 범위로 재사용**. 명령만 분리, 코드 공유.

## Mandatory Reading
- src/lib/date.ts (날짜/KST 처리 — '어제' = 마지막 활동일)
- src/lib/git-porcelain.ts / git.ts (git log 선례, safeExecFile)
- src/lib/goal-frontmatter.ts (goal 상태 읽기 — NOT_STARTED/IN_PROGRESS)
