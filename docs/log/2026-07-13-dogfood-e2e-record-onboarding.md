# 2026-07-13 — e2e 도그푸딩 영수증: RFC 0060+0061 통합 (init→기록→집행→수확)

> 대상 버전: `vhk --version` = **2.11.0** · HEAD = **bddde8b** (RFC 0060·0061·v2.11.0 준비 포함, npm 미발행)
> 실행: 로컬 소스 `node dist/index.js` — 신규 프로젝트(scratchpad `e2e/`)에 전 흐름 직접 굴림. 메인 트리 무변경.
> 역할: roadmap Phase 3 exit criteria "신규 프로젝트 e2e 도그푸딩 영수증"의 실측 증거.

## 한 줄 결론

**RFC 0060(init 기록 온보딩)은 전부 작동, RFC 0061(기록 집행 커밋훅)도 차단·우회·정상경로 다 맞음.** 발행 게이트 통과 수준. 단 실사용 흐름에서 마찰 2건 — **P1 배선 시점**(git 없이 init 시 집행 훅 미배선, 재실행 필요) · **P2 첫 커밋 HEAD 에러 노이즈**(차단은 되나 무서운 stderr 노출).

## 실 사용감 (1인칭)

- init 한 번에 "설치 점검 9/9·5/5 ✅"가 떠서 **뭐가 준비됐는지 즉시 신뢰**가 생겼다. `**FILL**` 은어 대신 `[여기에 작성: 질문]`이라 "아 여기 이걸 적으면 되는구나" 바로 이해됐다.
- 근데 첫 `git commit` 때 시뻘건 `fatal: ambiguous argument 'HEAD'`가 떠서 **"내가 뭘 잘못했나" 철렁**했다. 실제론 정상 차단인데 에러 메시지가 그걸 안 알려준다.
- src 커밋을 일지 없이 하려니 막혔고, AI 작업지시("일지 쓰고 재커밋 or [skip-record]")가 명확해서 **뭘 해야 할지 헤매지 않았다.** 마찰이 사람이 아니라 커밋 실행자에게 오는 설계가 체감됐다.

## 장단점

| 좋은 점 | 나쁜 점 |
|---|---|
| init 영수증이 디스크 읽기검증 기반 — "됐다"를 믿게 함 | git 없이 init 시 집행 훅 미배선(재실행 필요) — nextSteps에 재실행 안내 없음 |
| 자동 sync로 AGENTS.md 즉시 생성(9/9 규칙 파일) | 첫 커밋 시 HEAD 에러 stderr — 정상인데 사용자엔 실패처럼 보임 |
| 커밋훅 차단/우회/정상 전부 정확·AI 작업지시 명확 | 수확(handoff) 실제 ADR/TS 후보 시나리오는 미검증(사소커밋이라 후보 0) |
| 슬롯 카운트(13개)로 "얼마나 채웠나" 측정 가능 | |

## 문제점 (심각도순, 증거)

### P1 — RFC 0061 배선 시점: git 없이 init 하면 집행 훅 미배선 `[신규]`

- **증거**: 신규 폴더 → `vhk init`(git 없음) 시:
  ```
  ⚠️ 기록 집행 훅 미배선 — git 저장소가 없거나 worktree/bare 저장소입니다. 일반 저장소면 git init 후 vhk init 재실행 시 자동 배선됩니다.
  ```
  `.vhk/hooks/record-check.mjs` 파일은 생기지만 `.git/hooks/commit-msg`는 안 걸림. `git init` 후 `vhk init` **재실행**해야 배선됨(재실행 시 `✅ .git/hooks/commit-msg 기록 집행 훅 배선` 확인).
- **왜 마찰인가**: init nextSteps 안내가 `git init && git add . && git commit`인데, **이 첫 commit 시점엔 훅이 없어 기록 집행이 안 걸린다.** 그리고 nextSteps 어디에도 "git init 후 vhk init 재실행" 문구가 없다 → 사용자가 재실행을 안 하면 집행 그물이 영영 안 켜짐.
- **완화 상태**: init 로그에 미배선 경고는 뜬다(위 문구). 하지만 완료 후 "다음에 할 일"엔 반영 안 됨.
- [추론] 근본 해결 후보: (a) init nextSteps에 "git 없으면 git init 후 vhk init 재실행" 명시, (b) RFC 0061 §5 열린결정대로 `core.hooksPath=.vhk/hooks`로 git-less 배선(재실행 불요). 현재 구현은 `.git/hooks` 직접 방식이라 git 선행 필수.

### P2 — 첫 커밋 시 `fatal: ambiguous argument 'HEAD'` stderr 노이즈 `[신규]`

- **증거**: 첫 커밋(HEAD 없는 root-commit)에서 record-check.mjs가 `git show ... HEAD`(line 64, 같은날 후속 완화용)를 호출 → HEAD 없어 `fatal: ambiguous argument 'HEAD'` stderr. **차단 판정은 정상 진행**(line 71 주석 "첫 커밋 — 완화 없이 차단 판정")이라 기능 무해.
- **왜 P2**: 기능은 맞지만 사용자가 정상 차단을 **실패/버그로 오해**한다. 무서운 `fatal:` 이 BLOCK 안내문보다 위에 뜬다.
- [추론] 완화: HEAD 존재 여부를 먼저 확인(`git rev-parse --verify HEAD`)해 첫 커밋이면 `git show HEAD` 호출 자체를 건너뛰기.

## 정상 작동 확인 (증거)

| 단계 | 결과 |
|---|---|
| init 마커·가드 | PRD·ARCHITECTURE `[여기에 작성:]` + 상단 가드 ✅ |
| 자동 sync | `규칙 파생 완료 — AGENTS.md 등` · 설치점검 9/9 ✅ |
| 인터뷰 훅 2단계 | customization-check.mjs에 1단계·2단계·PRD.md·VISION.md 지시 ✅ |
| 슬롯 카운트 | `vhk check` → "미완성 슬롯 13개 — PRD 9·ARCHITECTURE 4" ✅ |
| 집행 차단 | 일지 없는 src 커밋 → **실제 차단**(커밋수 0) + AI 작업지시 ✅ |
| [skip-record] 우회 | 우회 커밋 통과(커밋수 1) ✅ |
| 정상 경로 | 일지 스테이지 후 커밋 통과(커밋수 2) ✅ |
| handoff 수확 | 실행됨·사본 저장. 후보 0(사소 feat 커밋이라 감지 대상 없음 — 정상) |

## 워크플로 (실사용 일일 루프)

1. `vhk init` → **바로 `git init` → `vhk init` 재실행**(P1 회피 — 집행 훅 배선). 그다음 첫 커밋.
2. 작업 → src 변경 커밋 시 일지(`docs/log/YYYY-MM-DD-*.md`) 같이 스테이지 or `[skip-record]`.
3. 세션 종료 `vhk work handoff` → 미기록 ADR/TS 후보 프롬프트 확인.
- **함정**: git 없이 init만 하고 재실행 안 하면 집행 그물이 안 켜진 채로 개발이 흘러감(P1).

## 필요한 스킬·훅 (현황)

- 현재 배선: `.vhk/hooks/customization-check.mjs`(SessionStart 인터뷰) · `.vhk/hooks/record-check.mjs`(commit-msg 집행) · `.git/hooks/commit-msg`(재실행 시) — 다 정상 생성.
- 제안: **없음(신규)** — 훅 인프라는 충분. P1은 새 훅이 아니라 **배선 안내/방식** 문제.

## 기능 제안 (발견에서)

1. **init nextSteps에 재실행 안내**(P1): git 없이 init 시 "다음에 할 일"에 `git init` **후 `vhk init` 재실행` 한 줄. (저비용·고효과)
2. **첫 커밋 HEAD 가드**(P2): record-check.mjs가 `git show HEAD` 전 HEAD 존재 확인.
3. (선택) 수확 실검증: ADR/TS 키워드 커밋(예: `fix: null 처리`)으로 handoff 후보 감지 e2e 1회 — 이번엔 사소 커밋이라 후보 0이었음.

## 다음 행동 선택지

- **A. P1·P2 수정**(별도 승인) — 둘 다 저위험·저비용(nextSteps 문구 + HEAD 가드). e2e가 "발행 게이트"라 발행 전 고치면 첫인상 개선.
- **B. 이대로 발행 게이트 통과 처리** — 핵심 기능(0060·0061) 다 작동, P1·P2는 마찰이지 차단 아님. 발행 후 후속.
- **C. 수확 실검증 추가** — ADR/TS 후보 감지까지 e2e 확장 후 발행.

[추론·확신 중간] **A 추천** — P1(재실행 안내 없음)은 실사용자가 집행 그물을 통째로 놓칠 수 있어 발행 전 한 줄 고칠 값어치가 큼. P2도 첫인상(무서운 에러) 문제라 같이.

---

## 조치 (A 선택 — P1·P2 수정 완료, TDD)

- **P1 수정**: `ko.init.gitHintCommand` = `git init && vhk init && git add . && git commit …` — 복붙 명령에 `vhk init` 재실행을 넣어 git init 직후 기록 집행 훅이 자동 배선(첫 커밋부터 집행). 이 명령을 쓰는 사용자 = git 없던 사람이라 대상 정확. 테스트: `tests/init.test.ts` gitHintCommand 검증.
- **P2 수정**: `src/templates/record-hook.ts` — `git show HEAD` 완화 로직 전에 `git rev-parse --verify -q HEAD`(quiet)로 HEAD 존재를 먼저 확인. 첫 커밋이면 show 자체를 건너뛰어 `fatal: ambiguous argument 'HEAD'` stderr 노이즈 제거. 차단 기능은 불변. 테스트: `tests/record-hook.test.ts` "첫 커밋 fatal 노이즈 없음"(RED→GREEN).
- **실 재현 검증**: 신규 프로젝트 재현 시 (P1) 복붙 명령에 `vhk init` 포함 확인 · (P2) 첫 커밋 시 `fatal|ambiguous` 소멸, `[record-check BLOCK]`만 출력.
- **게이트**: tsc 0 · lint 0 · record-hook 21 test · 전체 스위트 green.

**결론: e2e 발행 게이트 통과 + 발견 마찰 2건 즉시 해소.** 수확(③) ADR/TS 후보 실검증은 후속(이번 사소커밋이라 후보 0).
