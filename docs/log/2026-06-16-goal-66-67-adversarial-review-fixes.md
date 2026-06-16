# 2026-06-16 — goal66/67 적대적 코드리뷰 + 확정 14건 수정

## 배경

PR #273(goal66 VISION 앵커 + goal67 loop-brief, rebase로 goal71/72 흡수) 머지 전 멀티에이전트 적대 리뷰 실행.
- 워크플로: 5차원 병렬 find(버그/규약/보안/테스트/일관성) → 발견마다 3관점 스켈틱(correctness·project-context·reproduce) 반증 → 2/3 이상 실제 판정만 확정.
- 71개 에이전트, 발견 22건 → **확정 14건(HIGH 6·MEDIUM 8) / 기각 8건**.

## 수정 14건

### 코드 버그 (loop-brief.ts)
- **#1** readVisionWhat What 정규식 `[^\n#]+` → 본문 '#'(C#·Next.js #앱)에서 잘림. `## What[^\r\n]*\r?\n([^\r\n]+)` 로 교체(헤딩 변형 내성 + '#' 보존 + CRLF 안전).
- **#2** recall 렌더가 `content`만 읽어 lesson-only 실패교훈이 빈 줄로 사라짐(유령 섹션). `content||lesson||why||id` 폴백(다른 렌더러와 통일).
- **#3** HARD_STOP 활성 메시지 `**` 마커 홀수(볼드 번짐). 잉여 `**` 제거.

### 4지점 등록 (#4)
- `cli-args.ts` KNOWN_COMMAND_TOKENS 에 `loop-brief`·`루프브리핑` 누락 → `vhk loop-brief` 가 commander 안 거치고 NL 정규식 우연 매칭으로만 동작. 두 토큰 추가.
- ko.ts `loopBrief.title` 키 추가 + `t()` 사용(브리핑 패턴 통일 — "ko.ts 메시지 필수" 규약 충족).

### 보안 (#9·#10)
- **#9** `.vhk/loop-brief.md`(블로커·교훈 평문)가 git 추적됨. 원천 memory.json은 gitignore인데 파생물이 보호 약함. `.vhk/.gitignore` + `VHK_GITIGNORE_TEMPLATE` 양쪽 등록 + 파일 헤더 '로컬 전용·커밋 금지' + .vhk/README 트래킹 표 갱신.
- **#10** scan-llm-guardrails 가드가 파일 전역 매칭 → 주석 한 줄로 PAT-001/002/004 탐지 통째로 우회(false negative). 가드를 문제 라인 ±20 윈도우(`nearMatch`)로 한정 + JSON_EXTRACT_GUARD 과도 토큰(`fenced`·`indexOf.*{`·`replace.*```) 제거.

### 게이트 강화 (#8·#11)
- check-goal-67: cli-args·한글별칭·ko.ts 검증 추가(누락이 CI 통과한 근본 원인 봉쇄).
- check-goal-66: 템플릿↔파서 계약(readVisionWhat 정규식이 vision.ts/VISION.md 헤딩과 매칭) 게이트 고정.

### 테스트·문서 (#5·#13·#6·#14)
- **신규** tests/loop-brief.test.ts(7) — 파서·폴백·#1/#2/#3 회귀 고정.
- **신규** tests/scan-llm-guardrails.test.ts(7) — PAT-001/002/004 fixture 검출 + 안전 케이스 false-positive 0 + #10 우회 회귀.
- nlp-router.test.ts +2 — 루프 브리핑↔브리핑 오라우팅 가드(goal67 카드 명시 리스크).
- gen-goals-index.test.ts +1 — 커밋된 goals/README.md == 재생성 결과(stale 봉쇄).
- goals/README.md 재생성(stale: 66/67 NOT_STARTED·71/72 누락·카운트 오류 → 70건 정정).
- README.md 명령표에 `vhk loop-brief` 추가.

## 기각 8건 (참고)
- "MCP 계약 정상"·"VISION 3자 일치" = 정상 확인 노트(버그 아님).
- "placeholder가 What으로 렌더"(init이 description 항상 채움)·"i18n 하드코딩"(report 본문은 brief.ts도 하드코딩)·"listGoals 중복 호출"(성능 미미)·"가드레일 exit code 미반영"(CI 계약이 시크릿 한정·의도)·"라인길이 가드 부재"(결과 정확성 무영향) 등 반증 성공.

## 검증
- typecheck/lint ✓ · test 1708 pass(+17) · goal66/67 게이트 ✓
- e2e `node dist/index.js loop-brief` 정상 · `git check-ignore .vhk/loop-brief.md` → 무시 확인

## 교훈
- 4지점 등록은 cli-args(KNOWN_COMMAND_TOKENS)까지 5지점으로 봐야 안전 — 누락 시 commander 우회·별칭이 NL 정규식 우연 매칭에만 의존. 게이트가 4지점 전부를 강제해야 'CI 통과=규약 준수' 신뢰 유지.
- 보안 스캐너 가드는 '파일 전역 any' 금지 → 문제 라인 인접 윈도우. 전역 가드는 무관한 방어 흔적/주석으로 미탐 우회됨(거짓 안심이 미탐보다 위험).
- 파생 산출물(loop-brief.md)은 원천(memory.json)과 동일 보호등급 — 파생물이 더 약하면 유출 경로.
