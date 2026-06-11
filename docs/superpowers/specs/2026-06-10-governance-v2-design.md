# Governance v2 — 기록 집행 엔진 + 문서 탐색 인덱스 (설계)

> 출처: 2026-06-10 문서·규칙·거버넌스 5영역 진단(`.claude/plans/audit-docs-governance-2026-06-10.md`).
> 범위 = 진단 테마 T1(집행) + T2(탐색성). T3~T5는 후속 spec.

## Context (왜)
뼈대(카테고리·네이밍·게이트 60개)는 좋은데 **기록 집행 엔진이 없어** 기록이 사람/AI 기억에 의존 → 반복 누락.
실증: goal 60 구현 세션이 dev log/ADR 없이 커밋(이 spec을 촉발). ADR 실제 0건, til 2주 stale, troubleshooting 3건(버그픽스 30+ 대비). 또 docs/ **인덱스가 없어** 54파일·61 goal 탐색 곤란. 목표 = ①누락을 자동으로 잡고(집행) ②한눈에 보이게(인덱스).

## Goals
- AI 세션이 코드 변경 후 기록 없이 커밋하는 것을 **자동 차단**(하이브리드: 평소 자문, 커밋 시점 차단).
- "언제 ADR/RFC/devlog/troubleshooting인가" 판단 기준 명문화.
- docs/ 와 goals/ 에 **탐색 인덱스** 제공(한국어 가시성 포함).

## Non-goals (이번 범위 밖 — 후속)
- devlog→learnings 완전 자동화(기존 `vhk learn`/`vhk memory` + 리마인더 넛지로 충분).
- goals 61개 파일 **리네임 안 함**(check-goal 매핑·git 이력 깨짐 위험) → 인덱스로 한국어 가시성 해결.
- goal frontmatter 스키마 통일·.vhk 정합·CHANGELOG 자동화(T4), 과거 백필(T5).

## Architecture
두 축, 한 브랜치(feat/governance-v2). 기존 패턴 재사용(check-*.mjs 게이트, listGoals, RULES.md→vhk sync).

### T1 — 기록 집행 엔진 (Claude Code hook, 하이브리드)
| 구성 | 책임 | 신규/수정 |
|---|---|---|
| `scripts/check-records.mjs` | staged diff에 실질 코드변경(src/commands·src/lib·scripts/check-goal) 있는데 dev log(docs/log/<오늘>-*.md) 미스테이지 & 커밋메시지에 `[skip-record]` 없으면 exit 1 + 사유. 순수+git staged 조회. | 신규 |
| `scripts/record-reminder.mjs` | 미커밋 코드변경 있는데 오늘자 dev log 없으면 자문 출력(차단X) + "교훈 졸업(vhk learn)·이 goal ADR 남길 것 있나" 넛지. | 신규 |
| `.claude/settings.json` (또는 .local) | **PreToolUse**(Bash matcher `git commit`) → check-records.mjs(차단). **Stop** → record-reminder.mjs(자문). | 수정 |
| `RULES.md` (→ vhk sync) | "기록 경로 판단표"(작은선택→commit msg / 패키지·정책→ADR / 설계→RFC / 에러→troubleshooting / 작업→devlog) + 카테고리 네이밍 컨벤션. | 수정 |
| `tests/check-records.test.ts` | 차단 로직(코드변경+devlog없음→fail / devlog있음→pass / [skip-record]→pass / 문서만변경→pass). tmpdir+가짜 staged. | 신규 |

### T2 — 문서 탐색 인덱스
| 구성 | 책임 | 신규/수정 |
|---|---|---|
| `docs/README.md` | 대시보드: 9 카테고리 맵 + 읽는 순서 + 각 1줄 목적 + 루트문서(ARCHITECTURE/spec/til) 안내. | 신규 |
| `docs/{adr,rfc,log,troubleshooting,patterns,superpowers,state}/README.md` | 폴더별 목적(1-2문단)+네이밍 규칙+유지정책. 손작성 1회(안정적). | 신규 |
| `scripts/gen-goals-index.mjs` + `goals/README.md` | listGoals(frontmatter)로 번호·**한국어 title**·status·priority·leads_to 표 자동생성. (수동편집 금지 마커) | 신규 |
| `docs/adr/ADR-0001-*.md` | 첫 실제 ADR — 이 거버넌스 결정 자체를 ADR로(집행 hook 선택 근거). ADR=0 해소 + 패턴 시범. | 신규 |

## 동작/데이터 흐름
- **커밋 차단**: 내가 `git commit` 호출 → PreToolUse hook이 check-records.mjs 실행 → staged에 코드변경 有 & devlog 無 & `[skip-record]` 無 → 차단+메시지("dev log 추가 또는 [skip-record]"). devlog 스테이지하면 통과.
- **Stop 자문**: 턴 종료 → record-reminder.mjs → 미커밋 코드변경+오늘 devlog 無면 안내(차단X).
- **인덱스 갱신**: gen-goals-index.mjs는 수동/게이트에서 실행(goal 변경 시 README 재생성). docs/README·카테고리 README는 정적(드물게 갱신).

## 에러 처리/탈출구
- `[skip-record]` 커밋 메시지 토큰 = 사소·문서전용·인덱스 커밋용 우회(과안정화 회피).
- hook 스크립트 실패(예외)는 **차단하지 않음**(fail-open) — 단 check-records의 "기록 없음"은 차단(fail-closed). 즉 게이트 자체 버그로 작업이 막히지 않게, 의도된 누락만 막음.
- record-reminder는 항상 exit 0(자문).

## 테스트
- `tests/check-records.test.ts`: 4케이스(위 표). + 라이브 레포 회귀(현 staged 0 → pass).
- hook 자체는 settings.json 등록 → 수동 e2e(아래 검증).

## 검증 (e2e)
- 코드 1줄 수정 후 devlog 없이 `git commit` → 차단 확인. devlog 추가 → 통과. `[skip-record]` → 통과.
- `node scripts/gen-goals-index.mjs` → goals/README.md에 61개 한국어 제목 표 생성 확인.
- docs/README.md에서 카테고리 클릭 동선 확인.

## 구현 체크포인트 (불확실 — 구현 시 확정)
- **`.claude/` git 추적 여부**: 추적되면 `.claude/settings.json`(레포 공유), 아니면 `.claude/settings.local.json`(로컬 전용) — `git check-ignore .claude/settings.json`로 확인. 공유가 목표.
- **PreToolUse Bash matcher**: `git commit` 패턴 정확히(별칭·`&&` 체인 포함?) — Claude Code hook matcher 문법 확인(update-config 스킬).
- check-records의 "코드변경" 판정 글롭: src/commands·src/lib·scripts/check-goal-*.mjs 포함, docs/·*.md·goals/README 제외.

## 순서 (구현)
1. check-records.mjs + 테스트(TDD) → 2. record-reminder.mjs → 3. settings.json hook 등록 + e2e → 4. RULES.md 판단표(+vhk sync) → 5. T2 인덱스(docs/README·카테고리·gen-goals-index·goals/README) → 6. ADR-0001(이 결정) → 7. 게이트 green + dev log(자기 자신 적용!).
