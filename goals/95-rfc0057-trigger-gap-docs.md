---
vhk_format: 1
type: goal
id: 95
title: RFC 0057 정식 문서화 + 트리거 격차 명시 — 순수 문서 트랙(트랙③) — P2
status: DONE
priority: P2
created: 2026-07-04
completed: 2026-07-04
leads_to: VHK 정체성(에이전트 불가지론 + 자가진화 복리)의 실측 감사 결과를 근거 문서로 고정 — 트랙①(ecosystem.mdc 모순 제거)·트랙②(receipt agent 필드)가 참조할 SoT 확보
---

# Goal 95: RFC 0057 트랙③ — 정식 문서화 + 트리거 격차 명시

> 출처: 2026-07-03 세션에서 사용자가 재확인한 VHK 정체성("어떤 에이전트가 와도 안 무너지고, 실수·문제가 데이터로 쌓여 자가진화하는 복리 루프") + opus 에이전트 실측 감사(`docs/state/next-task.md` 최상단에 인계됨). 사용자가 다음 세션에서 "이어가자"고 지시해 근거가 확실한 3개 트랙(①ecosystem.mdc 모순 제거 ②receipt agent 필드 ③이 goal — 문서화)으로 병렬 착수. **이 goal은 트랙③만 다룬다 — 코드 변경 0건, 순수 문서 작업.**

## 근거 (실측 — 2026-07-04 재확인)

- `src/templates/ecosystem-mdc.ts:17-18` — VHK 자신이 신규 프로젝트마다 심는 `ecosystem.mdc`에 "Claude Code = primary ... vhk-auto는 Claude-only"가 박혀 있음. 실제 생성물 `.cursor/rules/ecosystem.mdc:10-11`도 동일 텍스트로 확인 — "어떤 에이전트가 와도 안 무너진다"는 정체성과 VHK 자기 코드가 정면 모순.
- `src/lib/receipt.ts:75-88`(`ReceiptEvidence`)·`:176-193`(`Receipt`)·`src/lib/receipt-log.ts:22-47`(`ReceiptLogEntry`) — agent/actor 필드 0건. "여러 에이전트에서도 안 무너진다"를 자기 데이터로 증명할 방법이 없음.
- `src/commands/init.ts:515`(`CLAUDE_PROJECT_DIR`)·`:529-541`(`ensureSessionStartHook`) — `vhk init`이 신규 프로젝트마다 Claude Code 전용 `SessionStart` 훅을 `.claude/settings.json`에 배선. Cursor/Codex 대응물은 설계 자체가 없음.
- `docs/rfc/0055-vhk-proof-protocol.md`(archived) §3/§4/§9 — "Run 객체"(Claude/Codex/Cursor/human 구분, 판단엔 안 쓰되 기록은 함) 설계가 있었으나, RFC 0056(Evidence Receipt) 계승 과정에서 "판단엔 안 쓴다"만 남고 "기록은 한다"가 통째로 유실됨(0056 헤더는 "§3·§4·§9 결함 정정 후 재사용"이라 명시했지만 실제 구현엔 반영 안 됨).

## 동작

`docs/rfc/0057-agent-agnostic-compounding.md`를 신규 작성해 위 실측 감사 결과 4가지 + RFC 0055→0056 계승 손실 경위 + 스코프 결정(트랙①②③ + 후속 유보 2건: 메모리 프라이버시 긴장·할루시네이션 감소 루프)을 정식 문서로 고정한다. 트리거 계층 격차(§2.2·§7)는 "오늘 해소 안 함"까지 포함해 정직하게 명시하고 해결책을 제안하지 않는다.

- **문서만, 코드 0건** — 트랙①(ecosystem.mdc 수정)·트랙②(receipt agent 필드 추가)는 이 goal 범위 밖(별도 작업 단위에서 병행 진행).
- 부수 산출물: `docs/log/2026-07-04-rfc0057-track3-docs.md`(dev log) · `docs/state/next-task.md` 최상단 RFC 0057 항목 append 갱신.

## Completion Check

- [x] `docs/rfc/0057-agent-agnostic-compounding.md` 생성 — 배경(사용자 정체성 선언 인용)·실측 감사 4건(file:line 근거)·RFC 0055→0056 계승 손실·스코프 결정(트랙①②③+후속 유보 2건)·트리거 격차 정직 명시 섹션 포함
- [x] `docs/log/2026-07-04-rfc0057-track3-docs.md` 생성(dev log, 참고 문서·file:line 근거 기록)
- [x] `docs/state/next-task.md` 최상단 RFC 0057 항목에 append 갱신(기존 내용 삭제 없이, 3트랙 착수 사실 반영)
- [x] `goals/README.md`는 건드리지 않음(메인 세션이 나중에 재생성)
- [x] 코드(`src/**`) 변경 0건 확인 + 공통 게이트(_meta) + `check-goal-95.mjs`(고유 검증)

## Forbidden Actions (OUT)

- `src/**` 코드 변경 금지 — 이 goal은 순수 문서 트랙(트랙③)이다.
- 트랙①(`ecosystem-mdc.ts` 수정)·트랙②(receipt/ledger agent 필드 구현) 자체를 이 goal에서 수행 금지 — 별도 작업 단위 소관, 이 문서는 "발견 사실"만 인용한다.
- `goals/README.md` 직접 수정 금지 — 메인 세션이 일괄 재생성.
- `docs/state/next-task.md`의 RFC 0057 관련 항목 외 다른 섹션 수정 금지(다른 세션이 자주 건드리는 파일).
- `git push origin` / main 병합 금지 — 이 작업은 격리된 worktree에서 커밋까지만.

## Mandatory Reading

`docs/rfc/0057-agent-agnostic-compounding.md` · `docs/rfc/0056-vhk-evidence-receipt.md` · `docs/rfc/0055-vhk-proof-protocol.md` · `src/templates/ecosystem-mdc.ts` · `src/lib/receipt.ts`
