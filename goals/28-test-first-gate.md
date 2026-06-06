---
vhk_format: 1
type: goal
id: 28
title: test-first 게이트 (신규 기능 ↔ 테스트 매핑 + red→green 증거) — P2
status: NOT_STARTED
priority: P2
created: 2026-06-06
---

# Goal 28: test-first 게이트

> 출처: 2026-06-06 커뮤니티 스레드(글타래1: TDD 루프 = 실패 테스트 → 통과 구현 → 리팩토링) +
> VHK 자체 점검. Notion SUMMARY 동일.

## 배경 (왜)
점검에서 확인(레포 grep): goals/_meta.md 공통 게이트의 테스트 조건은
**"새 기능에 테스트 최소 1개 추가"** 뿐 → 테스트가 *나중에* 붙어도(test-after) 통과한다.
"테스트 먼저(red→green→refactor)"는 강제되지 않고, 레포에 TDD/test-first 단어도 없다.
(주: 일부 배치는 TDD 를 임의로 사용 — BACKLOG 배치1 "TDD/worktree". 단 게이트로 강제는 아님.)

## 동작 (어디·무엇) [추론]
- v0(현실적, 시점 증거 한계 고려): 강제 대신 **매핑 + 증거**.
  - 신규 src 기능 파일 ↔ 대응 tests/ 파일 존재 검사(_meta 4번 강화). 누락 시 경고.
  - vhk verify 리포트(latest.json)에 "신규 테스트가 최소 1회 실패→통과(red→green)" 증거 필드 옵션 기록.
- HARD 게이트(테스트 우선 미충족 시 done 차단)는 **opt-in 플래그**(`VHK_TEST_FIRST=1`)로만.

## Completion Check
- [ ] 신규 기능 파일에 테스트 매핑 없음 → 경고 출력
- [ ] verify 리포트에 red→green 증거 필드(옵션) 기록
- [ ] opt-in 플래그 ON 시에만 HARD 차단, 기본은 경고
- [ ] 기존 868 테스트 회귀 0
- [ ] 공통 게이트 통과

## 범위
- IN: 매핑 검사 + 증거 기록 + opt-in HARD 게이트.
- OUT: 커밋 타임스탬프로 "정말 먼저 썼는지" 강제 증명(위양성·우회 쉬움 → 제외).

## 트리거 / 우선순위 메모
- 과안정화 경계(헌법 제2조 · BACKLOG "실사용 신호 전 구현 금지"): test-after 로 버그가 샌 실사례가
  관측되면 그때 HARD 게이트 승격. 그전엔 매핑 경고 + 증거 기록까지만.

## Mandatory Reading
- goals/_meta.md (현재 테스트 게이트 조건 4)
- src/commands/verify.ts (latest.json 증거 스키마 — Goal 13)
- goals/13-verify-evidence.md (Evidence Ledger 연계)
