---
vhk_format: 1
type: goal
id: 12
title: 비대화형 가드 P2 — 잔여 명령 마이그 + save push 검토
status: DONE
priority: P2
completed: 2026-06-02
---

# Goal 12: 비대화형 가드 P2 (#14 후속)

> 설계 전문: `docs/superpowers/specs/2026-06-01-mcp-noninteractive-guard-design.md`
> Goal 11(P1) 완료 후 진행. 백로그.

## 배경
P1 이 안전핵심(감지 SoT + restore + lite-block + gate)을 처리. P2 는 나머지 대화형
명령을 3버킷 계약으로 기회주의적 마이그 + 걸친 케이스(save push) 정책 결정.

## 동작
- 잔여 benign/essential 마이그: theme, design-palette, sync(confirm), ship.
- `promptOrDefault`/`ensureInteractive` 일괄 적용 → 비-TTY 일관 동작.
- S5: `save` 의 push 가 standard 모드서 비대화형 자동실행되는 문제 — 비대화형 미승인이면
  push 막을지(외부영향) 결정. high-risk 승격 vs strict-extra 유지.
- (선택) `VHK_MCP_MODE` env → channel='mcp' preview UX (P1 에서 YAGNI 로 제외했던 것).

## Completion Check
- [x] theme/design-palette/sync/ship 비-TTY 일관 동작 + 테스트
- [x] save push 비대화형 정책 결정·구현
- [x] 회귀 없음 (P1 동작 보존)
- [x] 공통 게이트 통과

## 구현 결과 (2026-06-02)
- **theme** (① auto-default): 덮어쓰기 확인을 `promptOrDefault(…, false)`(stdin SoT)로 마이그 +
  `-y/--yes` 추가. 비-TTY·미승인 → inquirer 미호출(MCP 안전)·기본 보존(멈춤 없음).
- **ship** (② refuse-essential): 진입부 `ensureInteractive()` — 비-TTY 면 friendly 거부 + exit 1.
- **sync** (① auto-default): 확인 축을 **stdout→stdin**(`isInteractive`/`promptOrDefault`, E8/R1)으로 정정.
  비-TTY/`--yes` → 자동 덮어쓰기(백업 먼저라 손실 0). 기존 `syncCore` 시그니처 무변경.
- **design / design-palette** (② refuse-essential): Goal 11 의 `ensureInteractive` 이미 적용 →
  코드 무변경, 비-TTY 거부 테스트(`tests/design-guard.test.ts`)로 계약 잠금.
- **S5 결정 = `strict-extra` 유지** (high-risk 승격 ❌). 근거: commit 은 로컬·되돌리기 가능(undo),
  push 는 사용자 자기 remote 대상이라 deploy/publish(외부 배포=high-risk)와 등급 다름.
  spec ③ 버킷도 save 를 "strict 일 때만" destructive 로 분류. 최빈 명령을 standard 에서 막으면
  UX 파괴 — push 차단을 원하면 `strict` 모드(이미 비-TTY·미승인 save 차단)가 탈출구.
  `save.ts` 무변경(기존 save 테스트 보존) + 회귀 테스트로 계약 잠금(`tests/safety-guard.test.ts`).
- 제외: `VHK_MCP_MODE` preview UX — 여전히 YAGNI(비-TTY 가 MCP 안전 이미 커버). 후속 goal 로.
- 테스트: 585 → 596 (신규 11). 회귀 0.

## Mandatory Reading
- `docs/superpowers/specs/2026-06-01-mcp-noninteractive-guard-design.md` §9 (스코프 P2)
- Goal 11 구현 결과
