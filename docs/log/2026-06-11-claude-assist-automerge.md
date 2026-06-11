# 2026-06-11 — @claude 리뷰 반영 워크플로 + auto-merge 무인 머지 스킬

> 저녁 세션 산출물 2건(#259, #262)의 dev log. 하네스 사례 연구(#257)에서 "풀자동 머지는 따라가지 않는다"고
> 결정한 뒤, 헌법과 충돌하지 않는 **반자동 구간**만 골라 자동화한 후속 작업.

## 1. @claude 멘션 리뷰 반영 워크플로 — PR #259

- `.github/workflows/claude-assist.yml` 신설. PR 코멘트에 `@claude` 멘션하면
  `anthropics/claude-code-action@v1`이 리뷰 반영(커밋 푸시 + 답글)까지 무인 수행.
- **머지는 항상 사람** — 헌법(사람 게이트, publish main+2FA, 가드 #119)과 충돌하지 않는 구간만 자동화.
- 보안 게이트(public 레포): `@claude` 멘션 + `author_association == 'OWNER'` 일 때만 실행.
  외부인의 크레딧 소모·프롬프트 주입을 트리거 단계에서 차단(action 자체 write 권한 검증과 이중).
- 폭주 방지: `--max-turns 30` + `timeout-minutes: 30`. `persist-credentials: false`
  (action이 git 인증 자체 구성).
- 비용 인지: 2026-06-15부터 Agent SDK 월간 크레딧 차감(API 요율), 소진 시 종량제 — 워크플로 주석에 명시.

## 2. auto-merge 무인 머지 에이전트 스킬 — PR #262

- `.claude/skills/auto-merge/SKILL.md` 신설. `auto-merge` **라벨 붙은** 열린 PR만 대상으로
  4중 게이트 통과 시 무인 `gh pr merge --squash`. 가동은 전용 세션 `/loop 15m /auto-merge`
  (노트북 종료 = 의도된 kill switch).
- 4중 게이트: G1 CI 전부 pass(pending=대기) → G2 diff ≤500줄(초과=사람 호출) →
  G3 CodeRabbit 미해결 스레드 0(GraphQL) → G4 적대적 최종 리뷰(서브에이전트가 "머지하면
  안 되는 이유"를 적극 탐색, 불확실=치명).
- 안전 설계: 매 주기 HARD_STOP 선확인 / 주기당 최대 3개(AI 독주 방지) / 라벨은 사람만 부착 /
  publish·main 직접 push·resume 절대 금지 명문화.

## 3. 기록 정리 (이 세션)

- 오늘(2026-06-11) 커밋 8건(#254·#256·#255·#257·#259·#260·#261·#262) 중 dev log 미커버 2건
  (#259·#262)을 본 파일로 백필. 나머지는 기존 로그가 커버:
  도그푸딩 8건 → `2026-06-11-dogfood-bug-batch-243-250.md` / 하네스 사례 연구 →
  `2026-06-11-harness-case-study.md` / 전수 코드 리뷰 → `2026-06-11-full-code-review.md` /
  거버넌스 T1~T5 → `2026-06-10-governance.md` (+ 회고 백필 5편 `2026-06-11-retro-*.md`).
- 오늘 작업 전체를 Notion Dev Log DB(바이브코딩 Dev Log)에 적재 — 노뚝이 후속 처리용.

## 교훈

- **PowerShell 중첩 따옴표로 gh GraphQL 호출 깨짐** — `gh api graphql -f query='...'` 를
  PowerShell에서 실행하면 따옴표 파싱이 깨져 `Expected type 'number', malformed "-cpu"` 오류(실측).
  GraphQL 같은 중첩 따옴표 명령은 반드시 Bash 도구로. 스킬 본문에 강제 명시.
- **적대적 리뷰 서브에이전트에 구조화 스키마 금지** — schema 강제 시 StructuredOutput 미호출로
  발견사항 전부 유실된 전적(2026-06-10 적대검증) → auto-merge G4는 일반 텍스트 출력으로 고정.
- 외부 사례(풀자동 머지)를 그대로 복제하지 않고 **헌법과의 충돌 지점을 먼저 그어** 반자동
  구간(리뷰 반영·라벨 기반 머지)만 떼어내는 방식이 안전했다 — "차이는 결함 아닌 선택"(#257)의 실행편.
