# 2026-07-27 오픈소스 공개 경계·보안 정리

## 목표

VHK 공개 코어를 개인 생태계에서 분리하고, 공개 저장소와 npm 배포물에 적용할 보안 기본값과 재발 방지 게이트를 추가한다.

## 결정

- 범용 독립 CLI를 제품 경계로 확정했다.
- 공개 브랜드와 저자 정보는 유지한다.
- 기존 개인 규칙 설정은 v2.12에서 1회 호환하고 v3.0에서 제거한다.
- Git 이력은 실제 자격증명이 발견된 경우에만 재작성한다.

## 진행

- 현재 HEAD 내장 시크릿 검사: CRITICAL/HIGH/MEDIUM 0건.
- GitHub Secret Scanning·Push Protection·Dependabot Alerts 비활성 상태 확인.
- 의존성 감사에서 High 11·Moderate 14·Low 1 확인.

## 교훈

오픈소스 경계 검사는 시크릿 탐지만으로 충분하지 않다. 배포 번들의 환경변수명·개인 저장소 자동감지·생성 템플릿까지 검사해야 제품 결합을 발견할 수 있다.

## 구현 결과

- `VHK_RULES_FILE` → 홈 `rulesFile` → deprecated legacy → 번들 스냅샷 우선순위를 구현했다.
- bootstrap/sync/MCP 예시/Cursor 스킬을 범용 VHK 계약으로 재생성했다.
- npm dry-run 파일 목록과 `dist` 내용을 검사하는 `boundary:check`를 추가했다.
- pnpm 11.17.0과 의존성 override로 High/Moderate/Critical을 0건으로 낮췄다. 남은 2건은 Low다.
- GitHub Actions 외부 액션을 2026-07-27 확인 SHA로 고정했다.
- `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`를 추가했다.
- 628개 커밋을 값 미출력 방식으로 재검사했다. 의심 경로 4개는 모두 보안 테스트 fixture/example였고 실제 자격증명은 0건이라 이력 재작성은 하지 않는다.

## 검증

- `pnpm run typecheck` 통과
- `pnpm run lint` 통과
- `pnpm run test:run` 통과: 225 files, 2,535 tests
- `pnpm run build` 통과
- `vhk sync --check` 통과: 8개 타겟 drift 0
- `pnpm run boundary:check` 통과: npm 파일 10개, 개인 운영 경로·런타임 참조 0
- `pnpm run security:audit` 통과: High 이상 0

## 사람 게이트

개인 운영 산출물의 비공개 복사·공개 HEAD 삭제와 GitHub Secret scanning/Push protection/Dependabot security updates 활성화는 승인 후 수행한다. 상세 목록은 `docs/migration/oss-private-artifact-inventory.md`에 기록했다.

## 사람 게이트 완료

- 사용자 승인 후 개인 운영 파일 6개를 `yohan-brain/archive/vhk-public-boundary-2026-07-27/`에 SHA-256 매니페스트와 함께 백업했다.
- 공개 HEAD에서 `.agents/SOUL.md`, `.vhk/config.json`, `.vhk/events/*.jsonl`, `.vhk/ledger.jsonl`을 제거하고 재추적 방지 ignore를 추가했다.
- GitHub Secret scanning, Push protection, Dependabot alerts/security updates를 활성화하고 API 응답으로 확인했다.
- Validity checks와 non-provider/generic patterns는 개인 계정 소유 무료 public 저장소에서 지원되지 않아 비활성으로 남았다.

## 완료 게이트

- 개인 운영 원장 제거 후 기존 Goal 82의 “자기 저장소에서도 원장 추적” 테스트가 정책 충돌을 잡았다.
- 생성 프로젝트의 원장 추적 기본값은 유지하고, VHK 공개 저장소 자체만 비공개 예외로 분리하는 테스트로 갱신했다.
- `scripts/check-goal-108.mjs`에 범용 규칙 소스, 공개 경계, 보안 문서, High 의존성 감사 검사를 고정했다.
- Goal 108 전용 게이트가 typecheck·lint·2,535 tests·build·공개 경계·의존성 감사를 모두 통과해 DONE 처리했다.
