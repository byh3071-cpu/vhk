# 2026-06-13 — vhk init 기타(other) 타입 + 스택 직접 입력

## 배경

yohan-os(AI 네이티브 베어메탈 OS — Rust 마이크로커널) 시작 시 `vhk init` 의 "어떤 종류인가요?"
5개 선택지(웹앱/확장/CLI/노션/모바일)에 해당 항목이 없고, 기타/스킵도 불가. 스택(언어) 단계도
프리셋 강제라 Rust 같은 비-JS 스택을 지정할 방법이 없었다 (도그푸딩 발견).

## 변경

- `PROJECT_TYPES` 에 `🧩 기타 — 직접 입력 (OS·게임·임베디드 등)` (`other`) 추가
- 기타 선택 시 스택 자유 입력 프롬프트 (쉼표 구분 — 전각 ，·모점 、 포함, Enter=미정으로 건너뛰기)
- 추천 스택 거절(confirmStack=no) 시 즉시 취소 대신 직접 입력 기회 (Enter=기존처럼 취소)
- `detectManifestLangs` 신설 — Cargo.toml→Rust, go.mod→Go, pyproject.toml/requirements.txt→Python,
  Gemfile→Ruby, build.zig→Zig, CMakeLists.txt→C/C++
- `resolveInitStack` 우선순위: JS deps 감지(+매니페스트 병합, Tauri 류) → 프리셋 → (other 만) 매니페스트
- `-y --type other` 비대화형: 프롬프트 0 + 미정 폴백 (Goal 8 계약 유지)
- `--type` 도움말 2곳(`init`/`start`)에 `other` 반영

## 적대적 리뷰 (Workflow 14 에이전트, 발견 11건 → 검증 통과 8건)

반영한 핵심 수정:

1. **[major] `vhk theme` 회귀 차단** — 초안은 `detectProjectStack` 에 매니페스트 병합을 넣었는데,
   theme(#158)이 non-null 을 "JS 프로젝트 → src/ + .ts" 신호로 사용 → Rust/Python 프로젝트
   src/ 에 .ts 오염 회귀. **`detectProjectStack` JS-only 원복**, 매니페스트는 init 전용 소비로 분리.
   theme 테스트가 detectProjectStack 자체를 모킹해 CI 로는 절대 안 잡히는 결함이었음.
2. **[major] 떠돌이 매니페스트의 프리셋 silent 대체 차단** — 빈 requirements.txt 하나로
   `-y --type webapp` 스택이 ['Python'] 으로 둔갑 (비대화형 우회 불가). `resolveInitStack` 으로
   프리셋 타입에선 매니페스트 무시.
3. **[minor] 라벨 정확화** — 사용자 직접 입력/미정에 '추천 기술 묶음:' → `기술 묶음:` 분리.
4. **[minor] 분리자** — 전각 쉼표/모점 추가, 가운뎃점은 'CI·CD' 보존 위해 제거 (안내 문구와 정합).

## 교훈

- 공용 헬퍼(detectProjectStack)의 반환 의미를 바꾸면 **null 여부를 신호로 쓰는 호출처**가
  조용히 깨진다. 호출처가 해당 헬퍼를 통째로 모킹한 테스트는 이 회귀를 절대 못 잡는다
  → 의미 변경 대신 신규 함수 분리가 안전.
- 파일 존재(existsSync)만으로 발동하는 감지는 빈/떠돌이 파일 오탐 표면이 크다 —
  명시적 사용자 입력(--type)을 자동 감지가 silent 대체하지 않도록 우선순위 설계 필수.

## 검증

- build 성공, vitest 162 파일 / 1680 pass (+18 신규: init-other-type 9 · stack-detect 7 · init-yes 1 등)
