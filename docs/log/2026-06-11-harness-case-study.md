# 2026-06-11 — 하네스 엔지니어링 사례 연구 (영상 + mafia-codereview-harness 분석)

> 출처: 빌더조쉬 팟캐스트(바이브마피아 최수민) + `github.com/vibemafiaclub/mafia-codereview-harness` (v0.1.0, MIT) 전수 분석.

## 핵심 발견 (플러그인 구조)

- **코드 0줄, 100% 마크다운 프롬프트 하네스** — 플러그인 매니페스트 + 커맨드 프롬프트 7개(auto/write-intent/gen-criteria/create-pr-body/review/reflect-review/update-docs) + 샘플 YAML 2개, 총 643줄.
- **"fork"의 실체 = git worktree 지시 프롬프트** (세션 포크 API 아님). 격리 대상 구분이 진짜 설계 원칙:
  - **파일 격리** = worktree (산출물 생성 단계, 소스 수정 금지)
  - **컨텍스트 격리** = sub-agent (review만 — 구현 편향 차단, 사용자 확인 없이 자동)
  - **컨텍스트 보존** = reflect-review는 구현 세션에서 실행 (sub-agent 금지 명시)
- **gen-criteria 2단 필터**: ① `stacks` 메타데이터 매칭(기계적 1차) ② context/decision 의미 판단(LLM 2차) ③ "이 작업에 구체적으로 어떻게 적용되는지" 서술 강제(환각성 매칭 방지). ADR 전문은 sub-agent만 읽음 — 메인 컨텍스트 오염 차단.
- **리뷰 규율**: 모든 코멘트는 평가기준(code-quality-guide.md) 근거 인용 필수 — 취향 리뷰 구조적 차단. 설계의도 문서의 의도적 결정에 "왜 이렇게 했나요?" 금지, 의도-구현 불일치만 지적. `[p1~p4]` 우선순위 + side effect 명시 + ACCEPT/REJECT 판정 append.
- **update-docs 환류**: 신규 결정 vs 기존 문서의 충돌·연쇄수정·폐기 탐지 → MUST/RECOMMENDED 등급 제안. ADR context는 "고통의 서사" 수준으로 구체적으로(누가/어디서 고통받았는지).

## 결정 사항

1. **CodeRabbit 자동 PR 리뷰 도입** — PR #255 (`.coderabbit.yaml`, ko-KR, append-only 경로 제외, src/** 규칙 주입). public 레포 = Pro 무료. 사용자 GitHub App 설치 대기.
2. **Goal 62 기안** — docs-first 작업 의례 + docs-diff 산출물 (자문형, P2). RFC 0051 사후 감지의 사전 보완.
3. **recall 실사용 시나리오 추가** — "리뷰 기준 추출"(diff 요약 쿼리 → 관련 ADR·패턴 주입). next-task.md 반영.
4. **파이썬 headless 러너 보류** — 2026-06-15부터 `claude -p`/Agent SDK가 구독에서 분리되어 별도 크레딧·종량제(API 요율) 전환. 현행 대화형+worktree 패턴이 컨텍스트 보존 목적 달성, measure-first상 인프라 선행 금지.
5. **풀자동 머지는 따라가지 않음** — vhk 헌법(사람 게이트, publish main+2FA, #119)과 의도적 충돌. 차이는 결함 아닌 선택.

## 교훈

- 하네스 가치의 대부분은 코드가 아니라 **프롬프트로 명문화된 운영 원칙**(격리 대상 구분, 근거 기반 리뷰, 문서 환류)에 있다 — vhk가 이미 가진 자산(worktree, recall, review, RFC 0051)에 원칙만 이식하면 되고, 새 인프라는 거의 불필요.
- 외부 기법 도입 전 **과금 정책 변동 확인 필수** — 영상 시점(구독 무료)과 현재(6/15 종량제)의 경제성이 다름. 날짜도 소문(6/23)과 실제(6/15)가 달랐음.
