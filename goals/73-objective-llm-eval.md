---
vhk_format: 1
type: goal
id: 73
title: Objective LLM 판정 — "목표를 실제로 달성했나"를 LLM judge로 평가 (`vhk check --evals`)
status: BLOCKED
priority: P2
created: 2026-06-25
blocked_by: "RFC 0056 §2 정체성 결정 선행 필요 — '기계증거만(LLM 판단 0)' vs 'objective LLM을 opt-in 계층으로 허용' 중 하나 채택 전까지 착수 불가"
leads_to: 결정론(scope/forbidden)으로 잡지 못하는 "목표 달성 여부" 판정 계층 확보 → 의도 검증 깊이 확장
---

# Goal 73: Objective LLM 판정 — `vhk check --evals` L2 LLM-judge

> 출처: Goal 87 구현 노트(65줄) "objective(목표 달성) 판정은 범위 밖 — 기계로 못 잼(LLM judge 필요). → **Goal 73(`vhk check --evals` L2 LLM-judge) 후속**" · RFC 0056 §2 정체성.
> 한 줄: Goal 87이 "범위 밖"으로 넘긴 **objective 판정(작업이 실제로 목표를 달성했는지)**을 정식 goal로 수용한다. 단, RFC 0056 §2 "기계증거만(LLM 판단 0)" 정체성과 정면 충돌하므로 **정체성 결정이 선행**되어야 착수 가능하다.

## 블로커 (착수 불가 이유)

이 goal은 현재 **RFC 0056 §2 정체성과 정면 충돌**한다.

RFC 0056 §2는 VHK의 정체성 한 문장을 다음과 같이 확정했다:

> **"VHK는 '기계증거만으로(LLM 판단 0)' AI의 자기보고가 진짜인지 따지는 거짓완료 탐지기다."**

같은 §2 산출물 하단 고정 1줄:

> *"이 판정은 기계증거(종료코드·dirty·SHA) 기반이며 LLM 추론이 아니다. 통과해도 미묘한 오류는 남을 수 있다."*

이 정체성 아래에서 **"LLM이 '목표 달성 여부'를 판정한다"**는 objective LLM judge를 VHK 핵심 루프에 추가하는 것은 **"LLM 판단 0"을 깨는 self-contradiction**이다.

### 채택 전 선행 결정 (OR 조건 — 하나면 충분)

두 갈래 중 하나를 선택해야 이 goal이 착수 가능해진다:

1. **RFC 0056 §2 개정** — "기계증거-only" 조항을 완화해 "objective 달성 여부에 한해 LLM judge를 허용한다"는 정책을 §2에 명시. 정체성 슬로건("LLM 판단 0")도 함께 개정 필요. ADR이 뒤따라야 함.
2. **Opt-in 계층 분리** — objective LLM을 VHK 핵심 증거(기계 결정론 루프)와 완전히 분리된 별도 계층으로 설계. receipt/decision에 영향을 주지 않고, 사용자가 명시 opt-in(`--evals`)해야 활성화되는 *advisory* 레이어로만 존재. 이 경우 RFC 0056 §2 개정 없이 정체성과 공존 가능.

> 현재 상태: 위 두 갈래 모두 탐색 완료(방향 4로 식별), 설계·의사결정 미착수 — BLOCKED.

## 배경

### Goal 87이 "범위 밖"으로 넘긴 이유

Goal 87은 scope/forbidden 위반이라는 **결정론** 판정(변경 파일이 금지 glob에 매치하는지)을 구현한다. 이것은 기계가 할 수 있다:

- forbidden glob 매치 → block (사실)
- scope 밖 변경 → caution (사실)

반면 **"작업이 실제로 목표를 달성했는지"**는 glob·종료코드·SHA로 판정 불가하다. 예시:

- mission: "사용자 인증 버그 수정" → 변경 파일이 scope 안에 있고 테스트도 통과 → 기계 결정론은 pass
- 그러나 실제로 "인증 버그가 해결됐나"는 **의미적 판단**이 필요 → 기계로 못 잼

이 의미 판단(objective) 계층이 Goal 73의 과제다.

### 방향 4의 위치

의도 검증 설계에서 식별된 4개 방향 중:

| 방향 | 내용 | 상태 |
|------|------|------|
| 방향 1 | receipt 의도 대조(Goal 87 PR1) | 완료(#394) |
| 방향 2 | glob 정직화(부정 `!`·한글 경로 미지원=거짓 안전) | 설계 미착수 |
| 방향 3 | 위조·미설정 차단(init 스캐폴드·baseSha 무결성) | 설계 미착수 |
| 방향 4 | Objective LLM judge (**이 goal**) | BLOCKED |

## 목표 (착수 후 달성할 것 — 조건부)

선행 결정이 이루어진 후:

- `vhk check --evals` 또는 `vhk receipt --evals` 명령으로 objective LLM judge를 실행할 수 있다.
- LLM이 mission.json의 `goal` 필드(또는 동등 필드)와 실제 diff를 대조해 "목표 달성 가능성"을 advisory 신호로 반환한다.
- **Opt-in 경로 채택 시**: receipt decision(block/caution/pass)에 영향을 주지 않음 — advisory 메시지만. 기계증거 루프는 불변.
- **RFC 개정 경로 채택 시**: receipt evidence에 `objectiveEval?` 필드로 추가, 단조성 불변식(caution→pass 격상 금지) 유지.

## 완료 기준 (조건부 — 선행 결정 후 확정)

- [ ] 선행 결정 완료(RFC 0056 §2 개정 **또는** opt-in 계층 분리 설계 + ADR)
- [ ] `vhk check --evals` 명령 구현 + 등록 4지점(index.ts·command-registry·cli-args·ko.ts) + nlp-router 키워드
- [ ] LLM judge 호출이 기계증거 결정론 루프와 격리됨을 테스트로 증명
- [ ] receipt decision 단조성 불변식 유지(opt-in advisory가 pass 격상 못 함)
- [ ] check-goal-73.mjs 게이트(비스텁) — status DONE 시 필수

## 비고

- 이 goal이 BLOCKED인 이유는 **구현 난이도**가 아니라 **정체성 선택**이다. LLM을 쓰는 것 자체는 MCP/SDK 이미 사용 중이라 기술 장벽 낮음.
- Opt-in 경로는 RFC 0056 §2를 건드리지 않아 더 보수적이나, "의도 검증이 기계증거만인가" 질문을 열어두는 것 자체가 제품 정체성에 영향을 줌 — 조용히 추가하지 말고 명시적 결정 후 착수.
- ADR-006(receipt 정체성 확정)이 이 goal의 BLOCKED 근거를 간접 지지함.

## Forbidden Actions (OUT)

- RFC 0056 §2 개정 없이 LLM judge를 receipt decision(block/caution/pass)에 반영 금지.
- 선행 결정 없이 구현 착수 금지.
- 기계증거 결정론 루프에 LLM 판단 삽입 금지(opt-in 분리 경로 채택 시).

## Mandatory Reading

- RFC 0056 §2(정체성·포지셔닝) · ADR-006 · goals/87-mission-verify-intent-check.md:65(65줄 근거) · docs/state/next-task.md(방향 2·3·4 맥락)
