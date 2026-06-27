---
vhk_format: 1
type: goal
id: 87
title: 의도 대조 — receipt/review가 mission(시킨 것)을 검증에 반영 (의도 장갑 손바닥) — P0
status: IN_PROGRESS
priority: P0
created: 2026-06-23
leads_to: "AI가 시킨 대로(scope/forbidden) 했나"를 자동 판정 — 경쟁사 못 하는 해자(남들은 의도를 모름) 실현
---

# Goal 87: 의도 대조 — mission ↔ receipt/review 잇기

> 출처: 대화(2026-06-23) VHK 정체성 "의도 장갑" 확정 · 의도루프 코드감사([dev log 2026-06-23 intent-glove-plan](../docs/log/2026-06-23-intent-glove-plan.md)) · RFC 0056 §2 · ADR-006.
> 한 줄: VHK 정체성("인간 의도→AI 전달→의도대로 검증")의 **검증 면이 자동 루프에서 빠져 있다.** receipt/verify/review가 기계적 done(tsc·test·dirty·stale)만 보고, "시킨 범위·금지(mission)를 지켰나"는 안 본다. 이걸 잇는다.

## 근거 (실측 — 코드 확정 2026-06-23)
- `src/commands/verify.ts` — mission 참조 **0** (grep "mission" No matches). verify는 mission을 한 번도 안 봄.
- `src/commands/review.ts` — mission import 없음. 거짓완료를 따지면서 "시킨 범위 벗어났나"는 안 봄.
- `src/lib/receipt.ts` `ReceiptEvidence` = gates·dirty·stale·diffCover **4종뿐** — mission(의도) 증거 없음. receipt도 의도 미검증.
- `readMission` 소비처 = `mission.ts` 내부 + `nlp-run.ts` 표시용뿐 — verify/review/receipt = **0회**.
- ★이미 있는 자산★: `checkMission(changed, mission)` (mission.ts:203)는 **순수 함수**로 `{ violations(forbidden 위반)·warnings(scope 밖)·disclaimer }` 반환. `missionCheck()`(mission.ts:194-223)는 이 결과를 **콘솔+exit code로만 쓰고 버린다** — 아무도 못 읽음.
- ⟹ "AI가 내 의도(scope/forbidden)를 어겼나"를 잡으려면 사람이 `vhk mission check`를 **따로** 손으로 눌러야 함. receipt/verify를 돌려도 의도 위반은 통과 처리. **장갑의 존재 이유(의도 검증)가 자동 루프에 없음.**

## 동작
- **receipt(우선)·review가 `.vhk/mission.json` 존재 시 `checkMission`을 자동 호출**해 의도 증거를 판정에 반영.
- **forbidden 위반 = block** (결정론적 사실 — 변경 파일이 금지 glob 매치. red/dirty/stale와 동급 실차단).
- **scope 밖 변경 = caution** (advisory 경고, block 아님).
- **mission.json 없으면 동작·decision 변화 0** (하위호환).

## 설계 (구현계획 — 코드 미작성, 설계만)

### 통합 지점 — 옵션 A 권장
- **A) receipt에 5번째 증거 `intent` 추가** ★권장★
  - `ReceiptEvidence.intent?: { forbiddenHits: number; scopeWarnings: number; missionKnown: boolean }` (옵셔널 — staleKnown 패턴과 동형).
  - `commands/receipt.ts`(수집 경계)가 mission.json 있으면 `checkMission` 호출 → intent 채움. 순수 `decideReceipt`가 `forbiddenHits>0 → block`, `scopeWarnings>0 → caution`, `missionKnown=false → 무효(영향 0)` 반영.
  - 이유: receipt = "됐나?" 판정 주체(데모 표면). checkMission이 이미 pure라 글루만. **latest.json 안 건드림**(격리 존중 ↓).
- **B) verify가 mission 대조해 latest.json 기록** — ⚠️ **비권장**. mission.ts:16 주석이 "별도 네임스페이스(.vhk/mission.json — **latest.json 불변**)"로 의도적 격리를 명시. latest.json에 mission 박으면 이 결정을 깸.

### 구현 단계 (PR 분해)
1. **PR1 (핵심·최소):** `commands/receipt.ts` 수집기가 mission.json 있으면 `checkMission` 호출 → `ReceiptEvidence.intent` 채움. 순수 `decideReceipt`에 intent 반영(forbidden→block, scope→caution). **테스트**: forbidden→block · scope→caution · missionKnown=false 하위호환 · 단조성(intent가 pass 격상 못 함).
2. **PR2:** `review`가 forbidden 위반을 "거짓완료 의심"으로 표면화(confidence cap 또는 경고 1줄). review는 이미 거짓완료 교차검증을 하니 의도 위반을 그 신호에 합류.
3. **PR3 (선택):** receipt `.md`에 "의도 대조" 섹션(scope/forbidden 결과) 추가 — 사람이 PR에서 한눈에.

## 수용 기준
- mission.json 있고 forbidden 위반 → receipt `decision=block`.
- scope 밖 변경 → `caution` (block 아님).
- **mission.json 없으면 동작·decision·출력 변화 0** (하위호환).
- 단조성 불변식 유지 — intent 증거가 caution/block을 pass로 격상 못 함(receipt 기존 불변식과 정합).
- **latest.json 스키마 불변** (격리 결정 존중 — 옵션 A).
- GA: 기존 verify/mission/receipt 시그니처 추가만(옵셔널 필드). breaking 0.

## Completion Check (PR1 완료 · PR2/게이트 잔여)
- [x] `ReceiptEvidence.intent?` 필드 + `commands/receipt.ts` 수집기가 mission.json 있을 때 `checkMission` 호출 (PR1, #394 예정)
- [x] 순수 `decideReceipt`가 forbidden→block · scope→caution 반영 (단조성 유지) (PR1)
- [x] 하위호환 테스트 — mission.json 없으면 기존과 동일(decision·출력 불변) (PR1)
- [x] 과확장 0 테스트 — scope 안 변경은 caution 유발 안 함 (PR1)
- [x] review가 forbidden 위반을 거짓완료 신호로 합류 (PR2)
- [ ] 공통 게이트(_meta), check-goal-87.mjs (vhk goal sync 자동생성)

## 구현 노트 (선조사 — 2026-06-23)
- `checkMission`은 이미 순수 + 테스트 가능 → 신규 로직 거의 없음, **글루(호출+증거배선)가 작업의 본체**.
- 이게 "의도 장갑"의 손바닥(연결 조직). 손가락(mission·verify·receipt)은 강한데 서로 손을 안 잡던 걸 잇는 것.
- ★해자 직결★: CodeRabbit·Claude review는 "코드가 좋나"만 봄(의도를 모름). VHK만 mission/RULES/생태계로 의도를 가짐 → "시킨 대로 했나" 판정은 VHK만 가능. 이 goal이 그 차별점을 코드로 실현.
- objective(목표 달성) 판정은 범위 밖 — 기계로 못 잼(LLM judge 필요). → **Goal 73(`vhk check --evals` L2 LLM-judge) 후속**. 87은 결정론(scope/forbidden)만.

## Forbidden Actions (OUT)
- latest.json에 mission 결과 기록 0 (mission.ts:16 "latest.json 불변" 격리 결정 존중).
- mission.json 없을 때 기존 동작 변경 0.
- objective 달성 판정(LLM 추론) 0 — 결정론(scope/forbidden)만. LLM judge는 Goal 73.
- 신규 명령 추가 0 — 기존 receipt/review 확장만(등록 4지점 영향 0).
- 기존 receipt 단조성 불변식 위반 0.

## Mandatory Reading
- src/commands/mission.ts (`checkMission`·`missionCheck`·`readMission`·MISSION_PATH_REL·16줄 격리주석) · src/lib/receipt.ts (`ReceiptEvidence`·`decideReceipt`·불변식) · src/commands/receipt.ts (수집 경계) · src/commands/review.ts · src/commands/verify.ts · RFC 0056 §2 · ADR-006
