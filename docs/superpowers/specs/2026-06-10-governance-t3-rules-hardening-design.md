# Governance T3 — 규칙파일 강화 (설계)

> 출처: audit-docs-governance-2026-06-10 테마 T3. governance-v2(T1+T2)와 같은 브랜치 stack. RULES.md→vhk sync로만 규칙 변경(헌법 영구구역·AGENTS.md·.cursorrules 직접편집 금지).

## Context
규칙 파일은 있으나 ①ADR/RFC/devlog/troubleshooting **판단기준 없음** ②코드 **주석 규칙 전무** ③Forbidden **분산**(CLAUDE.md + goals/_meta.md 중복) ④RULES.md↔CLAUDE.md 기록규칙 **drift 가드 없음** ⑤COMMANDS.md↔실제 CLI drift 검증 없음.

## 동작 (전부 RULES.md SoT → vhk sync 전파)
- **판단표**: governance-v2가 이미 "기록 경로 판단표" 추가 → T3는 중복 금지, **확장만**(있으면 스킵).
- **코드 주석 규칙**: RULES.md 코딩규칙에 2줄 — "복잡 로직(git porcelain·drift·sync)은 why 블록주석 / 자명한 건 주석 금지 / JSDoc 지양(타입 명확) / 트러블 원인 #이슈 참조". → sync로 .cursorrules·AGENTS.md 전파.
- **Forbidden 통합**: CLAUDE.md Forbidden + goals/_meta.md Forbidden Actions를 RULES.md 단일 Forbidden 섹션으로(헌법 영구구역은 포인터만, 직접수정 금지). sync 대상 포함.
- **신규 명령 체크리스트**: RULES.md에 "명령 추가 4지점(index.ts·command-registry 3종 한글별칭·cli-args)+COMMANDS.md+ko.ts+README" 명문화(.claude memory 함정과 일치).

## 게이트 (신규, 기존 check-*.mjs 패턴)
- `scripts/check-rules-sync.mjs`: RULES.md의 vhk:rules 블록 ↔ CLAUDE.md 자동생성 블록 해시 비교 → drift면 FAIL("vhk sync 필요"). check-meta에 편입 고려.
- `scripts/check-commands-doc.mjs`: COMMANDS.md 명령 표 ↔ src/commands/*.ts 파일명 집합 대조 → 누락 시 FAIL.
- 각 게이트 테스트(tmpdir 픽스처) + check-goal-NN(해당 goal 있으면)·아니면 governance 묶음 게이트.

## 경계 (OUT)
- 판단표 신규작성(v2가 함). RULES.md 대수술 금지 — 가산만.

## 순서: RULES.md 편집 → vhk sync(드리프트 0 확인) → check-rules-sync.mjs+test → check-commands-doc.mjs+test → 게이트 green.
## 검증: RULES.md만 바꾸고 sync 안 하면 check-rules-sync FAIL 재현. COMMANDS.md서 명령 1개 빼면 check-commands-doc FAIL. 정상시 pass.
## 체크포인트: CLAUDE.md 자동생성 블록 마커 정확 매칭(vhk:rules:start/end). Forbidden 이관 시 헌법 영구구역은 "→RULES.md" 포인터만 남김(영구구역 수정=LIVE 예외 규칙 위반 주의).
