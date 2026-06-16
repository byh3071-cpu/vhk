# 2026-06-16 — goal71·72 게이트 백필 + lint 픽스 (Fable5 직접 push 수습)

## 배경

전날(카페 노트북) Fable5 시스템 프롬프트 흡수 스프린트에서 goal71(core-ruleset 상속)·
goal72(secure LLM 가드레일)을 **main 직접 push**(9106ec1·2d302ce·2aa4f08, PR 없음).
집 컴퓨터(stale)에서 `git fetch` + main fast-forward 동기화 후 게이트 돌리니 깨짐 발견.

## 발견 (게이트 우회의 실제 피해)

1. **`findCompletedStubGates` 회귀 가드 실패** (`tests/meta-gate.test.ts:142`)
   — goal71·72 가 `status: DONE` 인데 `scripts/check-goal-71.mjs`·`check-goal-72.mjs`
   가 **아예 없음**(미싱). `vhk goal sync` 미실행 → 헛통과 DONE.
2. **lint 에러 2건** — `src/lib/core-rules.ts:150·155` 불필요한 타입 단언
   (`@typescript-eslint/no-unnecessary-type-assertion`). `pnpm lint` 미실행 흔적.
3. **로컬 의존성 미설치** — pull 이 `yaml@2.9.0` 추가 → `pnpm install`(CI=true) 필요했음.

## 한 일

- `scripts/check-goal-71.mjs` 신규 — 기본 게이트 + goal71 고유 검증(core-rules.ts export
  4종·CORE-RULES:START 마커·번들 스냅샷·init 의 .agents/CORE-RULES.md 생성)
- `scripts/check-goal-72.mjs` 신규 — 기본 게이트 + goal72 고유 검증(scanLlmGuardrails
  export·PAT-001/002/004·secure 호출+섹션)
- `src/lib/core-rules.ts` — 150·155 행 `as Record<string, string>` 단언 제거(불필요)

## 근본원인 (gate 우회 구멍)

main 브랜치 보호 = `required_status_checks: ["gate"]` 는 있으나 **`enforce_admins: false`**.
소유자(admin)는 보호규칙 면제 → `gate` CI 체크 건너뛰고 main 직접 push 가능.
`required_pull_request_reviews` 없음(PR 비강제) + 로컬 pre-push 훅 없음(.husky 는 sample 뿐).
→ "분류기가 직접 push 차단"은 부정확. admin 직접 push 엔 무력.

## 검증

- `pnpm lint` → exit 0
- `pnpm test` → 1690 pass (163 files), meta-gate green
- `node scripts/check-goal-71.mjs` → ✅ goal 71 gate passes (typecheck/lint/test/build + 고유 9)
- `node scripts/check-goal-72.mjs` → ✅ goal 72 gate passes (typecheck/lint/test/build + 고유 7)

## 교훈

- 게이트 우회 푸시는 "헛통과 DONE"을 만든다 — goal 파일 status=DONE 인데 게이트 스크립트
  미싱/스텁이면 `findCompletedStubGates` 가 잡지만, **그건 PR CI(`gate` job)가 돌 때만**.
  admin 직접 push 는 그 job 을 건너뛰므로 회귀 가드가 작동할 기회조차 없음.
- 브랜치 보호의 `enforce_admins: false` = 1인 admin 레포에선 사실상 무방비. 정책 결정 필요
  (true 로 올리면 소유자도 PR+게이트 강제 — 워크플로 변경이라 사람 판단).
- 멀티머신 작업 후 동기화 시: `git fetch` → ff → **`pnpm install`(lockfile 변경분)** → 게이트.

## 남은 작업

- 이슈 #274(goal71)·#275(goal72) close (작업 완료·게이트 백필됨)
- (정책) `enforce_admins: true` 전환 여부 — 사람 결정
- news-automation PAT-002 3건 실제 위반 픽스(별도 레포)
- goal73(check --evals LLM-judge, goal66 선행)
