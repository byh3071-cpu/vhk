---
vhk_format: 1
type: goal
id: 82
title: .vhk 런타임 산출물 gitignore 정합 — git status 청결 — P2
status: DONE
priority: P2
created: 2026-06-20
leads_to: vhk 명령 사용 후 git status 노이즈 0
---

# Goal 82: `.vhk` 런타임 산출물 gitignore 정합

> 출처: RFC 0053 §4(D6). 도그푸딩 감사 [D6]. 연계: Goal 45(증거 원장).

## 근거 (실측)
- `vhk` 명령 몇 개 실행 후 `git status`:
  - `?? .vhk/ledger.jsonl` — 런타임 생성물인데 **gitignore 안 됨**(untracked 노출).
  - ` M .vhk/events/ai-actions.jsonl` — **추적되어** 명령마다 변경 → 매번 diff에 잡힘.
- 추적/비추적 경계가 일관되지 않아 작업 중 git status가 지저분 → 진짜 변경이 묻힌다.

## 선조사 범위 재조정 (2026-06-22, goal 79/81 선례)
> 카드 premise("ledger.jsonl gitignore 추가")가 **정책과 정반대** — 재조정.
- 실측: `.vhk/README` **spec 1.1 트래킹 정책이 이미 `ledger.jsonl`·`events/ai-actions.jsonl` 둘 다 ✅ 추적("레포 영속", Goal 45/55)으로 결정**. ai-actions 는 추적 정합, `ledger.jsonl`만 **untracked(한 번도 `git add` 안 됨, 오변)**.
- `git check-ignore` 확인: ledger.jsonl 은 어떤 .gitignore 로도 제외 안 됨 → 단지 미추가.
- 따라서 `??` 노이즈의 올바른 해소 = **gitignore 가 아니라 추적**(spec·Goal 45 일치). gitignore 하면 Goal 45 증거 영속 설계가 깨짐(Forbidden "증거 원장 무결성 훼손 0" 정면 위반).

## 동작 (재조정 후)
- `.vhk/ledger.jsonl` **git 추적**(`git add`) → spec 1.1·Goal 45 일치, `??` 노이즈 해소.
- `ai-actions.jsonl` 추적 유지(이미 정합, Forbidden — `git rm --cached` 금지).
- `.vhk/README` 경계표에 "증거 원장은 증거 이벤트(verify·가드 mutate)에만 append → 일반 명령은 git status 안 더럽힘" 명확화.
- 정책 가드: gitignore 가 두 원장을 제외하지 않음 + 추적됨을 테스트/게이트로 락(미래 회귀 차단).

## 수용 기준
- 일반 vhk 명령 실행 후 `git status`에 의도치 않은 `.vhk` 변경이 안 뜬다(증거 원장은 추적되어 verify 시에만 변경 = 의도된 것).

> **Trade-off(명시):** 추적이라 `vhk verify` 후엔 ` M ledger.jsonl` dirty 가 뜬다 — 노이즈가 아니라 *그 작업의 증거*(작업과 함께 커밋). 멀티-컨트리뷰터에선 append-only JSONL 한 줄이라 머지 충돌 표면이 작고, `sameAsLast` dedup(동일 version·sha·status·dirty 면 append skip)으로 churn 최소. 일반(read-only) 명령은 원장을 안 건드려 status 청결. README 가 의도 명문화.

## Completion Check (작은 단위)
- [x] `.vhk` 런타임 산출물 목록화(생성 명령별) → 추적/비추적 분류(spec 1.1 표 = SoT, README 명확화)
- [x] ~~비추적 대상 gitignore 추가~~ → **재조정: ledger.jsonl 추적**(카드 premise 가 정책과 반대였음)
- [x] `ai-actions.jsonl` 추적 의도 확정(Goal 55 영속 — 추적 유지) + 일관 적용
- [x] 경계 명문화(.vhk/README — 증거 이벤트 append vs 일반 명령 구분)
- [x] 회귀 테스트: gitignore 가 증거 원장 제외 안 함 + 추적됨 가드(tests/vhk-artifact-tracking.test.ts + check-goal-82 git ls-files)
- [x] check-goal-82.mjs
- [x] 공통 게이트 통과, 회귀 0

## Forbidden Actions (OUT)
- 기존 추적 파일을 강제 `git rm --cached`로 끊어 사용자 이력 손실 0 (의도 확정 후 신중히)
- 증거 원장(Goal 44/45) 무결성 훼손 0

## Mandatory Reading
- .gitignore · docs/rfc/0001-vhk-directory-spec.md · goals/45-evidence-ledger.md
- src/lib/(ledger·event 기록 지점)
