---
vhk_format: 1
type: goal
id: 44
title: 증거↔커밋 SHA 바인딩 — verify 리포트에 HEAD SHA·dirty 기록 — P1
status: NOT_STARTED
priority: P1
created: 2026-06-07
leads_to: 증거 신선도 검증 (낡은 PASS 차단)
---

# Goal 44: 증거↔커밋 SHA 바인딩

> 출처: VHK 핸드오프(2026-06-07, 실측) Task E. Task B(증거를 남김)와 묶음 — 이건 그 증거를 지금 코드에 묶는 작업.

## 근거 (실측)
- `latest.json`은 종료코드는 기록해도 **git 커밋 SHA가 없어** "이 증거가 지금 이 코드 것"임을 증명 못 함.
- 낡은 PASS가 코드 변경 후에도 유효한 척 남는다.

## 동작
- `verifyEvidence`가 리포트 쓸 때 현재 `HEAD` SHA(+ working tree dirty 여부)를 `VerifyReport`에 기록.
- 릴리즈/완료 게이트에서 원장 SHA ≠ HEAD 또는 dirty면 경고/fail(증거 신선도 불일치).
- SHA 수집은 기존 git-access 통로 사용(새 execSync 금지 — Goal 46과 맞물림).

## 수용 기준
- 코드 바뀐 뒤 낡은 증거로 done 처리하면 게이트가 "증거 불일치"로 잡는다.

## Completion Check
- [ ] VerifyReport에 HEAD SHA + dirty 기록
- [ ] 게이트에서 SHA≠HEAD/dirty 시 경고·fail
- [ ] SHA 수집은 기존 git-access 통로(새 execSync 없음)
- [ ] 회귀 테스트
- [ ] check-goal-44.mjs 통과
- [ ] 공통 게이트(typecheck+test+build) 통과, 회귀 0

## Mandatory Reading
- src/commands/verify.ts · src/commands/verify-report.ts
- src/lib/git.ts · src/lib/git-repo.ts · src/lib/exec.ts
