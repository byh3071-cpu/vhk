---
name: vhk-auto
description: Use when one active VHK goal should run autonomously through implementation and verification without external publication or merge.
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
- **INV-5** commit 전 `docs/devlog/<오늘날짜>-autopilot.md` 에 1줄 append 필수.
  안 하면 check-records 훅(exit 2)이 막는다. src 실코드 커밋에 `[skip-record]` 우회 금지.
  이 경로는 **비추적**이라 `git add` 하지 않는다(공개 경계 — ADR-008·ADR-010).
- **INV-6** critical 결함 발견 또는 `vhk verify` 연속 2회 red 시 `.vhk/HARD_STOP` 파일 생성하고 종료.
  매 시작(0번)에 `.vhk/HARD_STOP` 존재를 먼저 확인한다.
- **INV-7** commit 만 자동. push·PR·머지·publish 는 절대 자동 금지.
- **INV-8** 적대리뷰는 현재 호스트에 맞는 독립 리뷰 어댑터를 정확히 1개 사용한다.
  [리뷰 어댑터](references/review-adapters.md)를 읽고, 지원되는 어댑터가 없거나 실행·인증·판정에
  실패하면 합격으로 간주하지 말고 중단 사유를 보고한다.
- **INV-9** 루프 시작 시 `vhk autonomy-log --event start`로 runId를 발급받아 루프 내내
  유지하고, 종결 분기에서 결과에 맞는 이벤트로 반드시 종결 기록한다(이슈 #373 자율성완주율
  계측 — 시작만 있고 종결이 없으면 완주율 분모/분자가 둘 다 부정확해진다).
- **INV-10** 합격 종결 전에 `vhk receipt` 를 반드시 실행한다. 완주 판정은 **같은 커밋 SHA 의
  receipt** 를 요구하는데(`isVerifiedComplete`), `vhk verify` 는 그 원장을 쓰지 않는다.
  빠지면 런이 기록돼도 `verified=false` 로 떨어져 관찰 게이트의 유효 실행에 들어가지 않고,
  자기 보고 격차로 잡혀 권한 승급까지 영구 차단된다. 커밋 직후에 불러야 SHA 가 일치한다.
- **INV-11** 자동 commit은 다른 writer가 없는 격리된 작업 브랜치에서만 한다. 병렬 에이전트·사람
  편집 세션이 같은 worktree를 쓸 수 있으면 시작하지 말고 각자 별도 worktree를 사용한다. 시작 전에
  `git -c core.quotepath=false status --porcelain=v1 -z --untracked-files=all`의 출력이 비어 있어야 하고
  `git branch --show-current`가 비어 있거나 `main`·`master`이면 시작하지 않는다.
  기존 변경을 stage·stash·reset·삭제해 기준선을 만들지 않는다. commit 직전 다시 상태를 읽어
  현재 브랜치와 Goal 범위를 다시 확인하며, 보호 브랜치이거나 범위 밖 경로가 하나라도 있으면
  `vhk save`를 호출하지 않고 blocked로 끝낸다. `vhk verify`도 증거 원장을 경로 한정 commit할 수
  있으므로 매 verify 직전에 같은 브랜치 검사를 한다. 이 검사를 생략할 수 없다.

## 루프 (1회 호출 = active goal 카드 1개)
0. **안전 확인**: `.vhk/HARD_STOP` 존재? → 있으면 즉시 중단, 사유 보고하고 종료. 이어서
   `git -c core.quotepath=false status --porcelain=v1 -z --untracked-files=all`의 출력이 비어 있고
   `git branch --show-current`가 비어 있지 않은 작업 브랜치인지 확인한다. 단일 writer를 보장할 수
   없거나 dirty·detached HEAD·`main`·`master`면 어떤 파일도 바꾸기 전에 사유를 보고하고 종료한다.
   (INV-6·INV-11)
1. **앵커 재주입**: `vhk loop-brief` 와 `vhk remind` 실행 → 산출 파일
   (`.vhk/loop-brief.md`·`.vhk/remind.md`) 를 Read 해서 의도·치명규칙을 컨텍스트에 넣는다.
2. **상태 파악**: `vhk work`(또는 `vhk goal next`) 실행 → 지금의 active goal 카드 1개를 식별한다.
   **런 시작 기록**(INV-9): `vhk autonomy-log --event start [--goal <n>]` 실행 → 발급된
   runId 를 루프 끝까지 들고 있는다(6번 종결 분기에서 그대로 쓴다).
3. **개발**: 그 카드의 미션을 구현한다. test-first(실패 테스트 먼저 → 통과 구현) + 기존 코딩 규칙 준수.
4. **결정론 게이트**: `git branch --show-current`가 여전히 이름 있는 비보호 작업 브랜치인지 먼저
   재확인한 뒤 `vhk verify` 실행 → `.vhk/reports/latest.json` 을 읽는다.
   green(typecheck/test/build/secure 통과) = 진행 허가 / red = 게이트 실패 카운트 +1. (INV-1·INV-4)
   첫 red이면 적대 검증이나 commit으로 진행하지 않는다. 같은 호출에서 실패 원인을 수정하고 `vhk verify`를 한 번 다시 실행한다.
   두 번째 red이면 hardstop 분기로 이동한다. 안전하게 수정할 수 없거나 재검증 전에 호출을 끝내야 하면 blocked 종결 분기로 이동한다.
5. **적대 검증**: [리뷰 어댑터](references/review-adapters.md)에서 현재 호스트용 독립 리뷰를
   1패스 실행한다. 추가로 `vhk review`·`vhk mission check` 실행 —
   exit code 는 결정론 중단신호, stdout 텍스트는 적대판단 신호로만(파싱 X, INV-4).
   판단 규칙: "치명(critical) 결함이 1개라도 있나? 불확실하면 치명으로 간주" → 있으면 중단. (보수적)
   review 실행·인증 실패 또는 결과 불명확이면 성공으로 간주하지 않고 6번의 blocked 종결 분기로 이동한다.
6. **종결 분기**:
   - **합격**(verify green AND 적대 치명 0):
     1) `docs/devlog/<오늘날짜>-autopilot.md` 에 "무엇을 했고 검증 결과" 1줄 append. (INV-5)
     2) `git branch --show-current`가 여전히 이름 있는 비보호 작업 브랜치인지 확인하고,
        `git -c core.quotepath=false status --porcelain=v1 -z --untracked-files=all`의 NUL 구분 레코드를
        전부 읽어 rename/copy의 원본·대상과 새 디렉터리 내부 파일까지 이번 Goal의 선언 범위인지 대조한다.
        보호 브랜치·detached HEAD·Goal 범위 밖 경로·출처를 확인할 수 없는 동시 변경이 있으면 기존
        변경을 건드리지 말고 blocked 분기로 닫는다. 모두 범위 안일 때만 다음 단계로 간다. (INV-11)
     3) `vhk save --no-push -m "<검증된 변경 요약>"`으로 작은 commit 1개. `--no-push`는
        로컬 commit만 명시 승인하는 경로다. 평범한 `vhk save`나 push를 포함하는 `--yes`는 쓰지
        않으며, 저장 실패는 성공으로 우회하지 말고 blocked 분기로 닫는다. (INV-7)
     4) `vhk receipt` 실행 — **커밋 직후, 종결 기록 직전**. (INV-10)
     5) `vhk autonomy-log --event complete --run-id <runId> [--goal <n>] [--ticks <n>] [--interventions <n>]`. (INV-9)
     6) goal 완주 → 정지 + 핵심 보고 → 종료.
   - **critical 발견 또는 verify 연속 2회 red**:
     1) `.vhk/HARD_STOP` 파일을 사유와 함께 생성. (INV-6)
     2) `vhk autonomy-log --event hardstop --run-id <runId> [...] [--review-rejected]`
        (적대리뷰 critical 이 원인이면 `--review-rejected` 포함). (INV-9)
     3) 핵심 보고 → 종료(사람이 `vhk resume --confirm` 하기 전엔 재진입 금지).
   - **재검증 전 중단·review 실패·그 밖의 start 이후 오류**:
     1) `vhk autonomy-log --event blocked --run-id <runId> [...]`. (INV-9)
     2) 첫 verify red를 안전하게 수정할 수 없는 경우, review 실행·인증·결과 실패, devlog append·commit 등 열거되지 않은 명령 실패도 모두 이 분기로 닫는다.
     3) 중단 원인과 재실행 조건을 핵심 보고하고 종료. 이 분기에서는 HARD_STOP을 만들지 않는다.
     4) terminal 이벤트 기록 자체가 실패하면 `.vhk/HARD_STOP`을 만들고 기록 무결성 실패를 보고한다.
   - **3사이클 진전 없음**:
     1) `vhk blocker "<증상>"` (독푸딩 중이면 `[dogfood]` 태그로 HARD_STOP 임계 우회 가능).
     2) `vhk autonomy-log --event blocked --run-id <runId> [...]`. (INV-9)
     3) 종료.
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
