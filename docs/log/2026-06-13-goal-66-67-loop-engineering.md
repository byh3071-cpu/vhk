# 2026-06-13 — Goal 66·67 기안 (루프 엔지니어링 빠진 조각)

## 배경

루프 엔지니어링(Claude Code 자율 루프 설계) 리서치 결과, vhk 가 이미 갖춘 루프 인프라
(`/loop`+`auto-merge` 클로즈드 루프 · `.vhk/HARD_STOP` 하드스탑 · memory v2 4버킷 ·
`evolve` 자기개선 · `context --compact` 토큰 절감)에 비해 **2조각이 빠짐**:

1. **북극성 앵커(VISION)** — 루프가 매 틱 "의도 고정"용으로 읽을 짧은 불변 문서.
   PRD(상세 제품정의)·RULES(규칙 SoT)와 역할이 다른, *변하지 않는 의도*만 담은 앵커.
2. **토큰-부족 루프 1틱 번들** — 매 반복 컨텍스트 리셋 + 최소 앵커만 재주입
   (의도+목표1개+관련교훈+STOP)으로 컨텍스트 폭증·의도 망각 방지. Ralph 의 `PROMPT.md` 역할.

## 한 일

- `goals/66-vision-anchor.md` — VISION.md 북극성 앵커 (init 템플릿 + 도그푸딩), `leads_to: 67`
- `goals/67-loop-brief.md` — `vhk loop-brief` 토큰-부족 1틱 앵커, `depends_on: [66]`
- `vhk goal sync` → `scripts/check-goal-66.mjs`·`check-goal-67.mjs` 빈 스텁 게이트 백필
- `gen-goals-index` → `goals/README.md` 66·67 반영

## 결정

- **기안만(NOT_STARTED)**. 게이트는 빈 스텁(`must()` 미작성). 근거: `findCompletedStubGates`
  는 DONE 만 FAIL, NOT_STARTED 는 스텁 정상. `goal drift` 도 must() 없으면 오탐 0.
- VISION 은 별도 파일(사용자 결정) — sync 파생 대상 아님(규칙 아니라 비전).
- loop-brief 는 신규 명령(사용자 결정) — `context --compact`/`brief` 와 다른 축(의도 고정 vs 환경 파악).

## 검증

- `check-goal-66/67.mjs` 통과 (typecheck/lint/test/build)
- `goal drift` 0건 (NOT_STARTED 오탐 없음), `check-goal-frontmatter` PASS (68건)

## 교훈

- vhk 가 이미 루프 엔지니어링 하네스의 한 구현체였음 — 빠진 건 "의도 고정 앵커"와 "1틱 압축 번들"
  뿐. 큰 신규 시스템이 아니라 기존 헬퍼(listGoals/recall/HARD_STOP) 조합으로 채울 수 있음.
- 기안 단계는 카드+빈스텁이 정답. 게이트에 must() 를 미리 채우면 NOT_STARTED 와 충돌(drift 오탐).
