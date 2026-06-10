---
id: ADR-0001
date: 2026-06-10
status: accepted
tags: [governance, hooks, records]
---

# ADR-0001: 기록 집행을 Claude Code hook 하이브리드로 한다

## 맥락 (Context)

기록 규칙(작업당 dev log·결정당 ADR)은 RULES.md·CLAUDE.md에 "필수"로 적혀 있었지만
실제 ADR은 0건, troubleshooting은 3건(버그픽스 30+ 대비)이었다. goal 60 구현 세션이
dev log/ADR 없이 커밋된 실증(2026-06-10 진단)이 이 결정의 직접 트리거다.
원인은 규율 부족이 아니라 **집행 엔진 부재** — 글로 적힌 규칙은 AI/사람 기억에 의존한다.
RFC 0051이 ADR/TS 후보 *감지·보고*(자문형)를 handoff에 배선했지만, dev log 누락 커밋을
*차단*하는 메커니즘은 여전히 없었다.

## 결정 (Decision)

Claude Code hook **하이브리드**(평소 자문 + 커밋 시점 차단)로 집행한다.

- **PreToolUse hook**(matcher `Bash|PowerShell`) → `scripts/check-records.mjs`:
  명령이 `git commit`이고 staged에 실질 코드변경(src/commands·src/lib·scripts/check-goal-*)이
  있는데 오늘자 dev log(docs/log/<오늘>-*.md)가 미스테이지면 **exit 2로 커밋 차단**.
  stderr 사유가 모델에 피드백되어 AI가 dev log를 쓰고 재시도하는 자기교정 루프가 생긴다.
- **Stop hook** → `scripts/record-reminder.mjs`: 미커밋 코드변경 + 오늘 dev log 부재 시
  자문 출력(항상 exit 0, 차단 없음).
- 탈출구: 커밋 메시지 `[skip-record]` 토큰(사소·문서성 커밋), hook 자체 예외는 fail-open
  (게이트 버그가 작업을 막지 않음 — 의도된 누락만 fail-closed).
- 설정은 `.claude/settings.json`(git 추적 = 레포 공유, ignore 안 됨 확인).

## 대안 (Alternatives)

1. **규칙 문구 강화만** — 기각: "필수"라고 이미 적혀 있는데 0건. 글은 집행이 아니다(실증됨).
2. **CI 게이트만** — 기각: 피드백이 PR 시점이라 너무 늦고, 로컬 다중 커밋 후 원격에서
   한꺼번에 실패하면 수습 비용이 큼. 커밋 시점 차단이 교정 루프가 가장 짧다.
3. **git pre-commit hook(husky 등)** — 보류: 클론마다 설치 필요 + 사람 수동 커밋까지 차단
   (사람은 [skip-record] 관례를 모를 수 있음). 누락의 원천이 AI 세션이므로 AI 경로(Claude
   Code hook)에 거는 것이 표적이 정확하고, stderr가 모델에 직접 전달되는 장점이 있다.
4. **ADR/TS 강제 자동 생성** — 기각: 과안정화. 무차별 생성은 docs 노이즈 — RFC 0051의
   자문형(보고만) 결정과 일관되게, 차단 대상은 dev log 하나로 좁힌다.

## 결과 (Consequences)

- (+) AI 세션이 실질 코드변경을 dev log 없이 커밋하는 경로가 기계적으로 닫힌다.
- (+) 차단 사유가 모델에 피드백 → 세션 안에서 즉시 자기교정(기록 후 재커밋).
- (−) 모든 Bash/PowerShell 호출마다 node 프로세스 1회 기동(~수십 ms) — 커밋 아닌 명령은
  즉시 통과라 체감 없음.
- (−) Claude Code 외 경로(터미널 직접 커밋, 다른 에이전트)는 안 막힘 — 필요해지면
  pre-commit(대안 3)을 추가 레이어로 재검토.
- 이 ADR 자체가 첫 실제 ADR — 기록 경로 판단표(RULES.md §기록 규칙)의 시범 사례.
