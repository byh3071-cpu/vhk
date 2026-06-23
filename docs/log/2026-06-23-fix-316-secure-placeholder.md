# 2026-06-23 — secure 가 .env.example placeholder 를 진짜 시크릿으로 오탐 (#316)

> 격리 worktree(fix/316-secure-placeholder)에서 TDD 단건 수정.

## 문제
`.env.example` 의 **비주석** KEY=value placeholder(`GITHUB_TOKEN=ghp_xxxx…`·`NOTION_TOKEN=secret_xxxx…`·`xoxb-your-…`)가 진짜 CRITICAL 시크릿으로 오탐 → secure scan FAIL → verify 게이트 통째 FAIL. 같은 토큰이 **주석줄**이면 정상 무시됨(비대칭).

## 근본 원인
`scan-secrets.ts` `findSecretsInLine`: 토큰형 패턴(github/notion/slack 등)의 값-기반 `PLACEHOLDER_MARKER` 검사가 `if (isComment && …)` 처럼 isComment 게이트에 묶여 비주석 KEY=value 라인엔 적용 안 됨. generic-api-key 만 `isGenericApiKeyFalsePositive` 로 주석 무관 거름. `risk-policy.ts` 는 `.env.example|.sample|.template` 을 이미 '시크릿 없는 템플릿'으로 예외 처리하는데 scan-secrets 가 그 예외를 공유 안 함(정책 불일치).

## 수정 (A+B 결합, 보수적)
- 신규 `isEnvTemplateFile(file)` — `.env.example/.sample/.template` 만 true(Windows 역슬래시 정규화). risk-policy·check-secure 의 기존 예외와 정합.
- `allowValuePlaceholder = isComment || isEnvTemplateFile(relPath)` → env 템플릿 파일에 한해 `PLACEHOLDER_MARKER` 무시를 주석 게이트 없이도 허용. marker 는 '명백한 placeholder 값'(`x{4,}`·`your[_-]`·`<…>`·example 등)만 매칭.
- ⚠️ isComment 게이트(#218/#250 보호)는 그대로 유지 — 템플릿 파일에서만 **추가로** 푼다. 일반 소스·실제 `.env` 는 동작 불변.

## 검증 (false-negative 0)
- 신규 테스트 9건(`#316` describe): 템플릿 placeholder 미탐 + **가드** — 진짜처럼 보이는 토큰(x 반복 아님, 36자+)은 `.env.example` 에서도 여전히 CRITICAL / 일반 `.env`·소스의 placeholder 는 완화 안 함 / 주석 진짜 토큰(#218/#250) 불변 / 프로젝트 스캔 회귀(섞인 진짜 토큰은 검출).
- `scan-secrets`·`check-secure`·`secure` 73건 green. `pnpm build` 성공. 전체 1811 pass(워커 contention 완화 시 — 기본 pnpm test 의 4~5건 timeout 은 Windows spawn e2e 환경 flake, scan-secrets 무관).
