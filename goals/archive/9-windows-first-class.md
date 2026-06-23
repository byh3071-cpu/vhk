---
vhk_format: 1
type: goal
id: 9
title: Windows/PowerShell 1급 지원
status: DONE
priority: P0
completed: 2026-06-01
---

# Goal 9: Windows 1급 지원

> 출처: 2026-05-31 VHK A/B 미니 해커톤 dogfood (vhk-project- / cafe-with-vhk).
> 자기개선 배치 — 자세한 공통 규칙은 `goals/_meta-self-improve.md` 참조.

## 배경
goal 게이트 실행에 Git Bash 경로 필요, PowerShell `&&` 문법 실패.
Windows 사용자가 1급이 아님.

## 동작 [추론]
- 셸 호출을 execa/cross-spawn으로 통일, `&&` 대신 코드에서 순차 실행
- check 스크립트를 node 기반 크로스플랫폼으로 (또는 .ps1 + .sh 동시 제공)
- 경로 처리 path.join 등 OS 비의존

## Completion Check
- [ ] PowerShell에서 Git Bash 없이 init→goal check/done 전 과정 동작
- [ ] macOS/Linux 회귀 없음
- [ ] 공통 게이트 통과

## Mandatory Reading
- 셸/프로세스 실행 유틸
- check 스크립트 실행 경로
