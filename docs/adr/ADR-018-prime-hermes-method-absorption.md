---
id: ADR-018
date: 2026-08-12
status: proposed
tags: [architecture, agent-agnostic, governance, method-absorption]
---

# ADR-018: Prime Agent·Hermes 를 외부 방법론 흡수 후보로 등재

> 용어: ADR-011 대응표 참조.
> 관련: [ADR-012](ADR-012-agent-agnostic-core-and-method-absorption.md) (흡수 원칙의 원본 —
> 이 ADR 은 그 원칙의 **적용 대상 확장**이며 원칙 자체를 바꾸지 않는다)

## 한 줄 결정

ADR-012 의 흡수 원칙(제품 중첩 없이 메커니즘만 clean-room 흡수)을 Prime Agent 와 Hermes 에
적용해 흡수 후보 목록에 등재하되, **이번 2.x 계열에는 구현을 편성하지 않고** 관찰 게이트 통과와
2.17 종료 후 재판정한다. VHK 의 정체성은 자가진화 에이전트가 아니라 **개선 효과까지 검증하는
검증·거버넌스 하네스**로 유지한다 — RSI(재귀 자가개선) 정체성 불추구는 2026-07-07 오너의
세션 결정이었고 저장소에는 성문화돼 있지 않았으므로 **이 ADR 이 성문화한다** (같은 취지의 기존
저장소 근거: ADR-012 "재귀 개선은 실측 근거가 생긴 범위에서만 주장한다").

## 맥락 (Context)

ADR-012(2026-07-31 작성, 08-01 승인)는 OMC·Superpowers·Shrimp Task Manager·Caveman 4종의
흡수/배제 경계를 확정했다. 그 뒤 두 도구가 공개·성숙했다.

- **Prime Agent** (Prime Intellect, 2026-08-06 공개, MIT) — RLM(원본을 통째로 컨텍스트에 넣지
  않고 지속 Python 환경에서 선택 조회) + Continual Harness(프롬프트·서브에이전트·스킬·기억을
  CRUD 상태로 두고 `/refine` 이 실행 이력을 근거로 소규모 수정, 기본 시스템 프롬프트는 불변,
  스냅샷 롤백).
- **Hermes** (Nous Research, 2026-02 공개, MIT) — 자가 호스팅 상시 데몬, 3층 기억(episodic·
  semantic·procedural), 경험에서 스킬을 생성·개선, 세션 간 사용자 모델, 예약 실행·메시징 연동.

오너는 두 도구의 학습·자가개선 방향이 원하는 방향과 겹친다고 확인했고, 기존 흡수 원칙을 이 둘에도
적용할지가 결정 질문이다. 동시에 기존 결정 두 가지가 경계를 이룬다: ①RSI(재귀 자가개선)는 쫓지
않는다 — VHK 의 차별축은 반증 가능한 검증 계층(2026-07-07 오너 세션 결정, 이 ADR 로 성문화)
②상시성(데몬·heartbeat·메신저)은 VHK 코어가 아니라 Runtime/Orca 몫(ADR-012 역할 분리).

## 결정 (Decision)

**등재한다.** Prime Agent·Hermes 는 경쟁 제품이 아니라 최신 방법론 공급원으로 취급하고,
ADR-012 와 같은 형식으로 흡수/배제 경계를 확정한다.

| 도구 | 흡수(남기는 것) | 배제(중첩하지 않는 것) |
|---|---|---|
| Prime Agent | 원본 컨텍스트 선택 조회 사상(요약본 대신 필요한 부분만 탐색 — Context Compiler 설계 입력) · 실행 궤적 성찰로 증거 기반 소규모 개선 제안 · 변경 스냅샷·롤백 · 예산 경계가 있는 제한 자율 실행 | 상주 IPython 커널 아키텍처 · 데몬 상시성 · 작업 중 실시간 자가수정(`/refine` 의 무인 적용) · 제품 설치·중첩 |
| Hermes | 세션 간 사용자·프로젝트 기억의 승격 계약(episodic→semantic→procedural 3층 구분) · 반복 업무의 스킬화 — 절차+입력+도구+완료 조건+실패 복구+검증 사례를 하나의 단위로 · 스킬 개선 이력과 강등 | 상시 데몬·cron·메시징 게이트웨이(Runtime/Orca 몫) · DSPy+GEPA 자동 진화 루프의 무인 승격 · RSI 정체성 |

**흡수 규율** (ADR-012 clean-room 원칙 + future-map 파이프라인 그대로):

1. VHK 에서 실제 문제가 먼저 발생했을 것 — 기능 목록 복제 금지
2. 외부 코드·프롬프트 복사 없이 VHK 계약(Goal·receipt·memory·evolve)으로 재설계
3. 격리 환경에서 기존 방식과 비교 → 개선 입증된 것만 **사람 승인으로** 승격, 악화 시 롤백
4. 단일 완료 판정자·단일 SoT 유지

**편성 경계**: 이번 2.x 계열(관찰 게이트 → 2.15~2.17)에는 이 ADR 을 근거로 한 구현을 편성하지
않는다. 관찰 게이트의 계측 결과와 2.17 종료 후, 어떤 메커니즘부터 흡수할지 별도 RFC 로 판정한다.

## 대안 (Alternatives)

1. **제품 설치·중첩** — 기각. 완료 판정자와 상태 원본이 복수가 된다(ADR-012 가 기각한 그 이유).
2. **전면 무시** — 기각. 두 도구 모두 MIT 공개라 방법론 공급원으로서 비용이 낮고, 특히 Hermes 의
   스킬화 계약과 Prime 의 궤적 성찰은 VHK 의 evolve(현재 규칙 후보 중심)가 넓혀야 할 방향과 겹친다.
3. **정체성 전환(RSI 추구)** — 기각. 2026-07-07 오너 세션 결정(이 ADR 로 성문화). Hermes 가
   이미 선점한 축이고, VHK 의 차별축은 어떤 에이전트 위에도 얹히는 반증 가능한 검증·거버넌스 층이다.

## 결과 (Consequences)

- 미래 작업자는 "Prime/Hermes 좋아 보이는데 왜 안 붙였나"의 답을 이 문서에서 찾는다 — 붙이지
  않은 게 아니라 메커니즘 단위로, 검증 게이트를 거쳐, 계열 밖에서 흡수한다.
- evolve 의 진화 대상 확장(규칙 → 기억·워크플로·스킬·평가기)은 이 ADR 이 아니라 후속 RFC 의
  범위다. 이 ADR 은 후보 등재와 경계만 정한다.
- 비용: 관찰 게이트 기간 동안 흡수 구현이 0 이므로, 두 도구가 그 사이 더 발전하면 재평가 시점에
  이 표가 낡을 수 있다 — 재판정 RFC 때 원 출처를 재확인한다.
- 미해결 위험: Prime/Hermes 의 기능 서술은 공개 문서·저장소 기준이며 직접 구동 검증은 하지
  않았다. 흡수 착수 시점에 해당 메커니즘의 실제 동작을 먼저 확인한다.

## 참고자료

| 도구 | 출처 (2026-08-13 확인) | 라이선스 (GitHub API SPDX 실측) |
|---|---|---|
| Prime Agent | [공개 저장소](https://github.com/PrimeIntellect-ai/prime-agent) · [공식 블로그](https://www.primeintellect.ai/blog/prime-agent) | MIT |
| Hermes | [메인 저장소](https://github.com/NousResearch/hermes-agent) · [공식 문서](https://hermes-agent.nousresearch.com/docs/) | 메인 MIT. 단 [self-evolution 저장소](https://github.com/NousResearch/hermes-agent-self-evolution)는 **라이선스 미표기**(SPDX null) — 그쪽 코드·프롬프트는 참조도 하지 않는다 |
