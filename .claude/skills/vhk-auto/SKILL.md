---
name: vhk-auto
description: VHK 프로젝트에서 active goal 1개를 사람 개입 없이 한 바퀴 자율 구동(앵커→개발→검증→적대리뷰→commit)하고 멈춰 핵심 보고. 외부 발송·이슈 등록·코드 집행 0(1단계 MVP). 트리거 - "오토파일럿", "자동으로 돌려", "혼자 한 바퀴", "vhk auto", "goal 자동 진행".
---

# VHK Autopilot (1단계 MVP)

VHK로 개발 중인 프로젝트에서 **active goal 카드 1개**를 사람 개입 없이 한 바퀴 돌리고,
끝나면 **멈춰서 핵심만 보고**한다. 위험한 건 하지 않는다 — 외부 발송·이슈 등록·코드 집행은
2단계 `vhk auto` 명령 영역이다.

## 🔒 불변조건 (절대 어기지 마라)
- **INV-1** 진행 허가 = `vhk verify` green(결정론)에만. 적대리뷰(LLM)는 "중단 트리거"로만 —
  "진행해도 된다"는 긍정 판정 금지.
- **INV-2** 외부 발송 0. `gh issue create` 호출 금지. 문제는 채팅 보고 + 이슈 초안 텍스트까지만.
- **INV-3** 집행 코드 0. dedupe·rate-limit·이슈 jsonl 영속 금지. (dev log append 는 허용·필수 — INV-5)
- **INV-4** 자동 합·불 입력 = `vhk verify` 의 `.vhk/reports/latest.json` + 각 명령 exit code 만.
  `vhk review`·`vhk mission check` 는 exit code 만 신뢰하고 stdout 텍스트는 파싱하지 말 것
  (텍스트는 적대 판단의 신호로만 읽는다).
- **INV-5** commit 전 `docs/log/<오늘날짜>-autopilot.md` 에 1줄 append + `git add` 필수.
  안 하면 check-records 훅(exit 2)이 막는다. src 실코드 커밋에 `[skip-record]` 우회 금지.
- **INV-6** critical 결함 발견 또는 `vhk verify` 연속 2회 red 시 `.vhk/HARD_STOP` 파일 생성하고 종료.
  매 시작(0번)에 `.vhk/HARD_STOP` 존재를 먼저 확인한다.
- **INV-7** commit 만 자동. push·PR·머지·publish 는 절대 자동 금지.
- **INV-8** 적대리뷰는 `/code-review` 스킬만 사용. cavecrew·Workflow 다중에이전트 쓰지 마라
  (이 환경에 없을 수 있음).

## 루프 (1회 호출 = active goal 카드 1개)
0. **안전 확인**: `.vhk/HARD_STOP` 존재? → 있으면 즉시 중단, 사유 보고하고 종료. (INV-6)
1. **앵커 재주입**: `vhk loop-brief` 와 `vhk remind` 실행 → 산출 파일
   (`.vhk/loop-brief.md`·`.vhk/remind.md`) 를 Read 해서 의도·치명규칙을 컨텍스트에 넣는다.
2. **상태 파악**: `vhk work`(또는 `vhk goal next`) 실행 → 지금의 active goal 카드 1개를 식별한다.
3. **개발**: 그 카드의 미션을 구현한다. test-first(실패 테스트 먼저 → 통과 구현) + 기존 코딩 규칙 준수.
4. **결정론 게이트**: `vhk verify` 실행 → `.vhk/reports/latest.json` 을 읽는다.
   green(typecheck/test/build/secure 통과) = 진행 허가 / red = 게이트 실패 카운트 +1. (INV-1·INV-4)
5. **적대 검증**: `/code-review` 1패스(자유텍스트). 추가로 `vhk review`·`vhk mission check` 실행 —
   exit code 는 결정론 중단신호, stdout 텍스트는 적대판단 신호로만(파싱 X, INV-4).
   판단 규칙: "치명(critical) 결함이 1개라도 있나? 불확실하면 치명으로 간주" → 있으면 중단. (보수적)
6. **종결 분기**:
   - **합격**(verify green AND 적대 치명 0):
     1) `docs/log/<오늘날짜>-autopilot.md` 에 "무엇을 했고 검증 결과" 1줄 append + `git add`. (INV-5)
     2) 작은 commit 1개. **commit 만** — push/PR 금지. (INV-7)
     3) goal 완주 → 정지 + 핵심 보고 → 종료.
   - **critical 발견 또는 verify 연속 2회 red**:
     1) `.vhk/HARD_STOP` 파일을 사유와 함께 생성. (INV-6)
     2) 핵심 보고 → 종료(사람이 `vhk resume --confirm` 하기 전엔 재진입 금지).
   - **3사이클 진전 없음**:
     1) `vhk blocker "<증상>"` (독푸딩 중이면 `[dogfood]` 태그로 HARD_STOP 임계 우회 가능) → 종료.
7. **보고**(두괄식, 핵심 먼저):
   `[결과 1줄] → [한 일] → [문제 있으면 핵심 + 이슈 초안 텍스트]`.
   이슈는 **초안 텍스트만** 제시한다 — 등록은 사람이 2단계 `vhk auto` 로 결정한다. (INV-2)

## 판정 모델
- **진행 허가**(commit 해도 되나?) = `vhk verify latest.json` 이 green 인가 (결정론, LLM 무관).
- **중단**(멈춰야 하나?) = verify red OR 적대 치명 OR `.vhk/HARD_STOP`.
- 적대리뷰는 "멈출 이유"만 찾는다. 불확실하면 치명으로 본다.

## 보고 규약
- 문제·정리는 **핵심 먼저(두괄식)**. 설계·이론·플랜 설명은 자세히 해도 됨.
- 비개발자 대상 — 전문용어는 쉬운 말로 풀이.
