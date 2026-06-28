---
vhk_format: 1
type: goal
id: 86
title: vhk receipt MVP — 4대 기계증거를 영수증 1장으로 (RFC 0056 T1) — P0
status: DONE
priority: P0
created: 2026-06-23
completed: 2026-06-28
leads_to: 에이전트 "됐어요"를 기계증거 영수증으로 — 거짓완료 탐지 90일 쐐기
---

# Goal 86: vhk receipt MVP (RFC 0056 T1)

> 출처: [RFC 0056 §6 T1](../docs/rfc/0056-vhk-evidence-receipt.md) · ADR-006(정체성 Accepted) · [dev log 2026-06-23](../docs/log/2026-06-23-rfc0056-adversarial-review.md).
> **선결: Goal 85(#315 봉인)** — 안 되면 receipt가 늘 block이라 데모 첫 장면이 깨짐.

## 근거
- VHK 정체성(ADR-006) = "AI 자기보고를 기계증거로 대조해 거짓완료를 잡는 결정론 판정". 90일 단일 성공기준 = 거짓완료 적발 1건(현 0/8).
- 신규 발명 0 — 기존 디스크 작동 자산(`verifyEvidence`·`review`·`checkEvidenceFreshness`·`reports/latest.json`)을 1장으로 조립하는 글루코드.

## 동작
- `vhk receipt` — 에이전트 "완료" 시점에 4대 기계증거 수집 → `.vhk/receipts/<날짜-슬러그>.{json,md}` 1장.
  - ① tsc/test/build 실종료코드 ② git dirty(자기파일 제외 — Goal 85) ③ stale(작업시작 SHA≠HEAD) ④ 변경라인 diff-cover.
- `decision = block|caution|pass`는 **기계증거로만(LLM 0)**. dirty/stale/red면 block. **caution→pass 격상 금지 단조성 불변식**.

## 수용 기준
- 등록 4지점(index.ts·command-registry TOP_LEVEL/CONTAINER·cli-args·ko.ts) + nlp-router 키워드 + 한글별칭(`증거영수증`) + 드리프트 테스트 green. (0055 §13-high#3 정면 예방 — 누락 시 첫 게이트서 빌드 깸.)
- 단조성 불변식(caution→pass 금지) 테스트 고정.
- **④ diff-cover는 advisory(약신호)로 분리** — decision을 block으로 격하시키지 못함(0056 §6 정직 경계). 실차단 = 종료코드·dirty·stale 3개.
- `.md`에 정직성 1줄: "게으른 거짓완료를 잡지, 미묘한 오류는 못 잡는다."

## Completion Check (작은 단위 — 완료)
- [x] receipt 수집기 — 4대 증거 기존자산 병합 (순수 + fs 경계 분리) — `src/lib/receipt.ts`(순수 decideReceipt/buildReceipt/render) + `src/commands/receipt.ts`(verifyEvidence·getCommitInfo·diffCoverage 글루)
- [x] decision 판정 — 기계증거만(LLM 0), 단조성 불변식 테스트 — `tests/receipt.test.ts`(caution→pass 금지 + pass≤caution≤block 단조 고정)
- [x] `.json` + `.md` 산출 — .md는 PR/대화 붙여넣기 1블록(decision 배지+게이트표+사유+정직성 1줄, HONESTY_LINE)
- [x] 등록 4지점(index·command-registry·cli-args·ko.ts) + nlp-router + 한글별칭(증거영수증) + 드리프트 테스트 green — `tests/receipt-registration.test.ts` + 기존 `tests/command-registry.test.ts` 자동 커버
- [x] diff-cover advisory 분리(decision 미격하) 테스트 — `tests/receipt.test.ts`(0% 미커버여도 block 아님, 실차단 3종만)
- [x] 공통 게이트(_meta), check-goal-86.mjs — `vhk goal sync` 생성 + goal 고유 검증 손추가, 게이트 통과

## 구현 노트
- T1 본체. **선결 Goal 85**(blockedBy). T2(자기보고 위조방어 + 붙여넣기 .md)·T3(거짓완료 적발 1건 공개입증, 사람 율속)는 후속 — RFC 0056 §6.
- ④ diff-cover의 구조적 한계(covered≠verified)는 Goal 85 노트·RFC 0056 §11·dev log 2026-06-23 §A 참조 — "전부 잡는다"로 과대표현 금지.

## Forbidden Actions (OUT)
- decision을 LLM 추론으로 내림 0 (기계증거만).
- 기존 `vhk ship`·`mission` 시그니처 변경 0 (0055 §13-high#1·#4 교훈 — 이름 충돌·두 이름 금지).
- caution→pass 격상 0.
- 효과 입증(T3) 없이 수익화·표준화 도약 0 (ADR-006).

## Mandatory Reading
- RFC 0056 §6·§11 · src/commands/verify.ts (verifyEvidence·checkEvidenceFreshness) · src/commands/review.ts · src/lib/evidence-ledger.ts · goals/85-receipt-self-reference-seal.md
