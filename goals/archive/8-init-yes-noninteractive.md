---
vhk_format: 1
type: goal
id: 8
title: vhk init -y 완전 비대화형
status: DONE
priority: P0
completed: 2026-06-01
---

# Goal 8: `vhk init -y` 비대화형 보장

> 출처: 2026-05-31 VHK A/B 미니 해커톤 dogfood (vhk-project- / cafe-with-vhk).
> 자기개선 배치 — 자세한 공통 규칙은 `goals/_meta-self-improve.md` 참조.

## 배경
`vhk init -y`가 `-y`인데도 타입 선택 프롬프트에서 멈춰 비정상 종료.
`--type webapp -y`로 우회해야 했음.

## 동작
- `-y`/`--yes`: 모든 프롬프트를 default로 자동응답
- `--type` 미지정 시 기본값(webapp 또는 첫 옵션)
- 비대화형 환경(`!process.stdout.isTTY`, CI) 자동 감지 → 프롬프트 skip

## Completion Check
- [ ] `vhk init -y`가 프롬프트 0개로 종료
- [ ] 타입 미지정 시 기본 타입으로 진행
- [ ] 대화형(플래그 없음) 경로는 기존대로 동작 (회귀 없음)
- [ ] 공통 게이트 통과

## Mandatory Reading
- init 커맨드 구현 + 인자 파서
