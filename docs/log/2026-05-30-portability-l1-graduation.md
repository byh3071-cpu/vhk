---
date: 2026-05-30
project: VHK
version: 1.3.1 → 1.5.1
type: 세션로그
---

# 2026-05-30 — 포터빌리티 L1 졸업 + v1.4.0/1.5.x 출시

## 요약

로드맵 "코드 STEP"(README 포지셔닝 → sync 확대 → publish → CI)을 전부 완료하고
**포터빌리티 L1 졸업**. `vhk sync` 대상이 3종 → 5종(+Copilot·Antigravity)으로 늘었고,
v1.4.0 → 1.5.0 → 1.5.1 순차 게시. 병렬 세션(RFC·goal·블로그)도 인계받아 정리.

## 무엇을 했나

### STEP 1 — README 포지셔닝 전면 교체 (#29)
- "올인원 CLI"(기능 개수) → "도구·기기를 바꿔도 규칙·맥락이 따라간다"(포터빌리티)
- "왜 VHK?" 문제→해결→명령 표 + 과장 방지 단서(자동 아님·개인메모 제외·git clone)
- 적대적 검증 워크플로(20주장 코드 대조)로 신규 문구 19/20 backed 확인 + 기존 과장 2건 수정

### STEP 1.5 — sync 출력 3종 → 5종 (#30, #36 보강)
- GitHub Copilot(`.github/copilot-instructions.md`) + Antigravity(`.agents/rules/vhk-rules.md`) 추가
- 0단계 감사로 공식 문서 경로만 채택, 비공식 `.antigravity/rules.md` 배제
- Antigravity 12,000자 제한 → `truncateForAntigravity` (UTF-8 byte 기준 + 구조 경계 + 마커)
- 자가 리뷰로 약점 2(byte/char, 미검증) + nit 3 보강

### STEP 2 — npm publish (#28, #37, #40)
- v1.4.0 출시 후 **게시본↔README 갭 발견** (게시 3종, README 5종) → v1.5.0 으로 일치
- v1.5.1 = npm description/keywords 포터빌리티화 즉시 반영(메타 패치)
- 클린룸 설치 검증 — 게시 dist 로 sync 5종 실동작 확인

### STEP 3 — GitHub Actions CI (#32, #41)
- PR·main 푸시마다 build+test 자동 (Node 24 + pnpm 11.2.2, install→build→test)
- CI 가 환경 불일치 2건(pnpm 9 거부 / pnpm 11.5 Node20 미지원) 첫날 잡음

### goal 엣지케이스 보강 (#36, roadmap §4)
- 중복 id 경고(`findDuplicateIds` 배선) / 없는 `--id` 메시지 통일 / title 콜론 보존(확인)

### 병렬 세션 인계 (#33, #34, #35, #39)
- RFC 0001 초안 / goal 순수함수 / Pain 블로그 초안 — worktree 로 깨끗한 개별 PR 분리
- RFC 공개: Issue #38 (의견 수렴) + `discussion` 링크

## 결과

- npm: `@byh3071/vhk@1.5.1` (latest), description = 포터빌리티 안내문
- 테스트 337/337 pass, CI green
- PR #28~#41 머지, 태그 v1.4.0 / v1.5.0 / v1.5.1
- RFC Issue #38 의견 수렴 중, Pain 블로그 ready(사람 게시)

## 교훈

1. **게시본 ≠ main 갭 주의** — 기능을 main 에 머지해도 npm 은 publish 해야 반영. README 가 미게시 기능을 약속하면 "설치 시 약속보다 적게 나오는" 신뢰 갭. 마케팅 전 publish 가 선결.
2. **공유 HEAD = 사고** — 두 세션이 한 working copy 공유하면 커밋이 엉뚱한 브랜치에 붙음. **worktree 격리**가 정답(라벨·보류는 damage control).
3. **byte vs char 보수 측정** — 외부 도구 제한이 "characters" 라 해도, 한글(UTF-8 3B) 환경은 byte 기준으로 enforce 하면 어느 해석이든 안전.
4. **마케팅 문구도 코드 대조** — 포지셔닝 주장은 적대적 검증으로 과장 색출. "정말 이래?" 가 신뢰의 기본.
5. **CI 첫 출근부터 일함** — 로컬(Node24/pnpm11.2.2)과 CI 기본값 차이를 CI 가 즉시 잡아냄.

## 관련 파일

- `src/commands/sync.ts` (5종 출력 + truncateForAntigravity)
- `src/commands/goal.ts` + `src/lib/goal-frontmatter.ts` (엣지케이스)
- `.github/workflows/ci.yml`, `.markdownlint.json`
- `docs/rfc/0001-vhk-directory-spec.md`, `docs/blog/2026-05-30-portability-pain.md`
- `package.json` / `README.md` / `CHANGELOG.md` (v1.5.1)

## 다음 단계

- 콘텐츠/마케팅 트랙 (사람): RFC #38 확산, Pain 블로그 게시, 커뮤니티/Product Hunt
- STEP 4 드리프트 감지(L2) — 출시 반응 신호 후 확정 (보류)
