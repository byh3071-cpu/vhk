---
date: 2026-06-19
title: goal 75 — vhk launch (풀사이클 뒷단 런칭 트랙)
---

# goal 75 — vhk launch (풀사이클 뒷단 런칭 트랙)

> append-only. RFC 0052 §4·§5 둘째 트랙. content(74) 다음 순서.

## 한 일

- 핸드오프(`handoff-fullcycle-2026-06-16.md`)·next-task·goals·열린 이슈 전수 파악 →
  RFC 0052 §5 시퀀스(content→**launch**→ops→sell) 기준 다음 코드 작업 = `vhk launch` 확정.
- `src/commands/launch.ts` 신규 — `buildLaunchPrompt`(순수함수) + `launch()` 핸들러.
  content.ts 패턴 복제: VISION What 수집 → 런칭 준비 체크리스트(도메인·랜딩·데모·OG·채널 3곳) +
  런칭 게시물·채널별 변형 초안 프롬프트 → `emitPrompt`(공유 헬퍼) → `.vhk/launch-prompt.md`.
- 9개 등록 touchpoint(remind/content와 1:1 대조 검증): index(import+command)·command-registry·
  cli-args(launch·런칭)·nlp-run(import+case)·nlp-router(type+rule)·ko.ts·mcp/server(읽기전용, 32→33)·
  templates/vhk-dir(.vhk 표+gitignore). + COMMANDS.md·README.md + 계약테스트(EXPECTED_TOOLS 33·DELEGATIONS).
- `tests/launch.test.ts`(순수함수 5건) · `goals/75-fullcycle-launch.md`(DONE) · `scripts/check-goal-75.mjs`(비스텁 게이트).
- 자문형 불변식 준수: 직접 게시·발송·결제·삭제 0, 외부 write API 0. 생성 프롬프트에 Fable5 위생
  (✅/❌ 쌍 · ≤3 변형/X 280자 하드리밋 · "사람 승인 전 게시·발송 금지") 박음.

## 게이트

- `pnpm build` ✓ · `pnpm test:run` 1743 pass(초기 1 fail = goals/README.md 자동인덱스 드리프트 → `gen-goals-index.mjs` 재생성으로 해소).
- `check-goal-75` 16개 고유검증 ✓ · 스모크: `vhk launch`·`런칭` 별칭·NL "런칭 게시물 만들어줘" → 모두 launch 라우팅 ✓.
- 적대적 리뷰(4차원 워크플로: 등록완전성·헌법안전·Fable5위생·문서드리프트) 수행.

## 교훈

- 신규 leaf 명령은 **가장 가까운 sibling(remind/content)의 모든 등록 출현지점을 grep 대조**하면
  "4지점 등록" 누락(NL 라우터 가드 무력화 위험)을 기계적으로 0으로 만들 수 있다. CLAUDE.md 체크리스트의 실전 적용법.
- 스모크 테스트가 cwd에 `.vhk/launch-prompt.md` 부산물 생성 → 레포 .vhk/.gitignore가 신규 prompt 파일을
  아직 모르면 untracked로 노출. 명령 추가 시 **vhk-dir.ts 템플릿 + 레포 자체 .vhk/.gitignore 양쪽** 갱신 필요(도그푸딩 일관성).
- `ship`(코드 npm 배포) vs `launch`(제품 공개) 이름 혼동 위험 → COMMANDS/README에 구분 1줄 명시(RFC 0052 §7).
