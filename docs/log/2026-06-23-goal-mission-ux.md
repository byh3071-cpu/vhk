# 2026-06-23 — fix #327·#328·#329·#330 goal/mission UX 정확도

## 배경
2026-06-22 미니 심시티 도그푸딩 자동 버그수색에서 나온 goal/mission UX 결함 4건(전부 P3, 손상·차단 없음, 메시지/어포던스 정확도 문제). worktree `fix/327-330-goal-mission-ux` 에서 TDD 로 처리.

## 한 일
- **#327 `vhk mission show` 깨짐** — `show` 서브커맨드 미등록이라 commander 가 `show` 를 mission(0-arity)의 위치인자로 보고 `too many arguments` cryptic 에러. set/check/clear 와 대칭으로 `show` 서브커맨드 등록.
  - `src/index.ts`: `missionCmd.command('show')` 추가(`.action(missionShow)`). bare `vhk mission` 의 default action 도 그대로 유지(둘 다 missionShow).
  - `src/lib/command-registry.ts`: `CONTAINER_SUBCOMMANDS.mission` 에 `'show'` 추가 — 안 하면 R1 드리프트 가드(command-registry.test.ts)가 실패(실제 commander 서브커맨드 ↔ 레지스트리 일치 강제). 이 가드가 #327 의 회귀 테스트 역할.
- **#328 첫 `goal next` 가 init 스캐폴드를 '수동 편집본'으로 오탐** — `STATE_NEXT_TASK_TEMPLATE` 에 auto-update 마커(``via `vhk goal next` ``)가 없어 휴리스틱이 무조건 manual 판정. 템플릿 본문에 마커 1줄 주입 → 휴리스틱 변경 없이 오탐 0.
  - `src/commands/goal.ts STATE_NEXT_TASK_TEMPLATE`: `_Auto-updated via \`vhk goal next\`._` 줄 추가.
- **#329 전부 DONE / 0개일 때 check·done 의 generic '대상 결정 불가'** — `goal next`(VHK-017)는 0개=`📭 정의된 goal 없음`, 전부완료=`🎉 모든 goal 완료`로 구분하나 check/done 은 `resolveGoalId===null` 을 단일 문구로 뭉갬. null 분기를 goalNext 와 동일하게 0개/전부완료로 갈라 안내(명령 동사만 check/done 으로 치환).
  - `src/commands/goal.ts goalCheck·goalDone`: `id===null` 분기를 goals.length 로 갈라 `📭 정의된 goal 없음` / `🎉 모든 goal 완료(검사/완료할 대상 없음)` 안내. 0개·전부완료는 정상 상태이므로 exit 0(이전엔 exit 1 — '설정 오류'로 오해 유발).
- **#330 비숫자 `--id abc` 모순 안내 — 이미 #317 로 해결됨(중복).** 현 main(0b80c05 #317 머지) 기준 `goal check --id abc` 는 이미 `유효하지 않은 goal 번호: 'abc' — 양의 정수만 됩니다` 로 정확히 지목. 회귀 방지용 명시 테스트만 추가(check·done 둘 다). 코드 변경 없음.

## 검증 (TDD)
- `tests/command-registry.test.ts`: 기존 드리프트 가드가 #327 회귀 가드(show 누락 시 자동 실패). + `vhk mission show` 가 commander 서브커맨드로 등록됐는지 명시 검증 추가.
- `tests/goal.test.ts`:
  - #328: init 직후 첫 goalNext 가 '수동 편집본' 경고를 내지 않음(red→green).
  - #329: 전부 DONE·0개 각각 goalCheck/goalDone 이 next 와 일관된 문구 + exit 0(red→green).
  - #330: goalCheck/goalDone `--id abc` 가 '유효하지 않은 goal 번호' 지목 + '대상 결정 불가' 로 새지 않음(회귀 가드).

## 남은 위험
- #329 에서 전부완료/0개를 exit 0 으로 바꿈 — 이전 exit 1 에 의존하던 스크립트가 있다면 동작 변화. 다만 두 상태는 '정상'이고 next 가 이미 exit 0 이라 일관성↑. CLI 사용자 영향 미미(P3).
- #327 `show` 는 bare `vhk mission` 과 동일 출력 — 의도된 별칭(어포던스 보강).
