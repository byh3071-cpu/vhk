---
vhk_format: 1
type: goal
id: 82
title: .vhk 런타임 산출물 gitignore 정합 — git status 청결 — P2
status: NOT_STARTED
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

## 동작
- 런타임 생성물(`ledger.jsonl` 등) `.gitignore`에 추가.
- `ai-actions.jsonl` 추적 의도 확정 — Goal 45(원장) 정책과 대조해 "추적 유지(이벤트 사료)" vs "제외" 결정 후 일관 적용.
- `.vhk` 추적/비추적 경계를 RFC 0001(.vhk 규격) 또는 `.vhk/README`에 명문화.

## 수용 기준
- 일반 vhk 명령 실행 후 `git status`에 의도치 않은 `.vhk` 변경이 안 뜬다(또는 의도된 것만).

## Completion Check (작은 단위)
- [ ] `.vhk` 런타임 산출물 목록화(생성 명령별) → 추적/비추적 분류
- [ ] 비추적 대상(`ledger.jsonl` 등) `.gitignore` 추가
- [ ] `ai-actions.jsonl` 추적 의도 확정(Goal 45 대조) + 일관 적용
- [ ] 경계 명문화(RFC 0001 또는 .vhk/README)
- [ ] 회귀 테스트: 대표 명령 실행 후 `git status --porcelain` 청결 단언
- [ ] check-goal-82.mjs
- [ ] 공통 게이트 통과, 회귀 0

## Forbidden Actions (OUT)
- 기존 추적 파일을 강제 `git rm --cached`로 끊어 사용자 이력 손실 0 (의도 확정 후 신중히)
- 증거 원장(Goal 44/45) 무결성 훼손 0

## Mandatory Reading
- .gitignore · docs/rfc/0001-vhk-directory-spec.md · goals/45-evidence-ledger.md
- src/lib/(ledger·event 기록 지점)
