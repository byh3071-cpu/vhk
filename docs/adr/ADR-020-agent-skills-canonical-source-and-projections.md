---
id: ADR-020
date: 2026-08-29
status: accepted
tags: [architecture, agent-agnostic, skills, sync, adapters]
---

# ADR-020: Agent Skills 공통 정본과 도구별 투영

> 상태: **Accepted — 2026-08-29 사람 승인.**
> 관련 결정: [ADR-012](ADR-012-agent-agnostic-core-and-method-absorption.md)
> 관련 현황: [RFC 0057](../rfc/0057-agent-agnostic-compounding.md)

## 결정 질문

VHK가 Google Antigravity, Claude Code, Codex, Cursor에서 같은 작업 계약을 사용하면서도 도구별
복사본이 서로 다른 안전 규칙으로 드리프트하지 않게 하려면 Skill의 정본과 투영 책임을 어디에 둘 것인가?

## 맥락 (Context)

VHK 저장소에는 현재 세 계열의 Skill이 따로 존재한다.

- Codex 계열: `.agents/skills/vhk-auto`, `overnight-vhk-auto`, `auto-merge`
- Claude Code 계열: `.claude/skills/vhk-auto`, `overnight-vhk-auto`
- Cursor 설치 계열: `src/lib/cursor-skill-templates.ts`에 내장된 5종을 `.cursor/skills`로 생성

같은 이름의 `vhk-auto`와 `overnight-vhk-auto`도 본문이 이미 다르다. 단순한 호출 문법 차이뿐 아니라
첫 verify 실패 뒤 재검증, review 실패 종결, SoT 경로처럼 안전 계약 자체가 한쪽에만 있는 항목이 있다.
Cursor 5종은 별도 TypeScript 문자열에 들어 있어 두 저장소 Skill과 함께 검사되지 않는다.

2026-08-29에 각 제품의 공식 문서를 확인한 결과 공통분모가 생겼다.

- [Google Antigravity](https://codelabs.developers.google.com/getting-started-google-antigravity)는
  프로젝트 Skill을 `<project-root>/.agents/skills/`에서 읽는다.
- [OpenAI Codex](https://developers.openai.com/codex/skills)는 저장소의 `.agents/skills/`를 읽고,
  `SKILL.md`의 `name`·`description`과 선택적 scripts/references/assets를 지원한다.
- [Cursor](https://cursor.com/docs/skills)는 `.agents/skills/`와 `.cursor/skills/`를 모두 읽고,
  Claude·Codex Skill 경로도 호환 경로로 읽는다.
- [Claude Code](https://code.claude.com/docs/en/slash-commands)는 Agent Skills 공개 형식을 따르지만
  프로젝트 발견 경로는 `.claude/skills/`다.

따라서 `.agents/skills`는 Antigravity·Codex·Cursor의 공통 프로젝트 경로가 될 수 있지만,
Claude Code를 위해서는 `.claude/skills` 투영이 필요하다. Windows와 원격 실행 환경에서 링크 지원을
가정할 수 없고, 사용자 수정본을 덮어쓰거나 삭제해서도 안 된다.

## 결정 (Decision)

### 1. 공통 정본

VHK가 여러 도구에 제공하는 **이식 가능한 Skill 계약의 정본은 `.agents/skills/<name>/`**으로 둔다.
공통 `SKILL.md`에는 특정 벤더의 slash command, 전용 환경변수, 사용자 홈 경로를 넣지 않는다.

정본은 다음 최소 공개 형식만 필수로 사용한다.

- 디렉터리별 `SKILL.md`
- frontmatter `name`, `description`
- 선택적 `scripts/`, `references/`, `assets/`

도구별 확장 필드는 공통 동작의 필수조건으로 삼지 않는다.

### 2. Claude Code 투영

Claude Code용 `.claude/skills/<name>/`은 `.agents/skills` 정본에서 생성하는 **관리 투영**이다.
생성기는 정본 버전과 해시를 표식으로 남기고 다음 규칙을 지킨다.

- 없으면 생성한다.
- VHK가 생성한 동일·구버전 사본만 갱신한다.
- 사용자가 수정했거나 읽을 수 없는 사본은 보존하고 수동 병합 대상으로 보고한다.
- 전역 `~/.claude/skills`에는 자동으로 쓰지 않는다.

### 3. 도구별 어댑터

벤더마다 다른 호출이 꼭 필요한 경우 공통 안전 불변식과 도구별 호출 표현을 분리한다.

- 공통 본문: 입력, 출력, 중단 조건, 사람 게이트, 금지 행동
- 얇은 어댑터: 독립 리뷰 호출처럼 호스트가 제공하는 동등 기능의 구체적 진입점

어댑터가 없거나 기능을 확인할 수 없으면 공통 본문이 임의 폴백으로 성공 처리하지 않고
`blocked` 또는 사람 확인으로 끝낸다. 어댑터는 공통 판정 기준을 완화할 수 없다.

### 4. 배포와 동기화

`vhk sync --check`가 Skill 정본·관리 투영·버전 표식의 누락과 drift를 읽기 전용으로 검사한다.
일반 `vhk sync`는 프로젝트 내부의 관리 사본만 생성·갱신한다.

새 프로젝트에는 `.agents/skills`를 기본 설치한다. Cursor는 이 경로를 직접 사용하며 신규 설치에서
같은 Skill을 `.cursor/skills`에 중복 생성하지 않는다. 기존 `.cursor/skills`는 다음처럼 이관한다.

- 정확히 알려진 VHK 생성본: 별도 승인된 마이그레이션에서만 공통 경로로 전환
- 사용자 수정본·미상 파일: 자동 삭제·이동·덮어쓰기 금지, 충돌 경고와 수동 절차 제공

### 5. 플랫폼 전용 Skill

모든 Skill을 억지로 공통화하지 않는다. 예를 들어 현재 `auto-merge`처럼 특정 호스트의 리뷰 명령과
명시 호출 정책에 의존하는 Skill은 지원 플랫폼을 선언한 전용 Skill로 남긴다. 전용 Skill도 공통
HARD_STOP·사람 게이트를 약화할 수 없다.

### 6. 범위 경계

이 결정은 Skill의 발견·정본·투영만 다룬다. SessionStart/Stop, PreToolUse 같은 훅 스키마와
AGENTS.md·CLAUDE.md·Cursor Rules의 항상 켜진 규칙 투영은 기존 어댑터 책임으로 남긴다.
글로벌 설치, 사용자 홈 변경, 플러그인 배포도 이 결정의 자동 실행 범위가 아니다.

## 대안 (Alternatives)

### A. 도구별 원본을 계속 독립 관리

현재 구조다. 각 도구의 기능을 최대로 쓸 수 있지만 동일 불변식의 누락을 검출할 정본이 없고,
실제로 `vhk-auto` 두 사본이 다른 종결 규칙을 갖게 됐다. 기각한다.

### B. 하나의 디렉터리를 심볼릭 링크로 공유

파일 중복은 줄지만 Windows 권한, Git 링크 처리, 원격·클라우드 작업자, Claude Code의 링크 동작을
공통 전제로 만들어야 한다. 이식성 목표와 맞지 않아 기각한다.

### C. `.claude/skills`를 정본으로 유지하고 다른 도구가 호환 경로로 읽게 한다

Cursor는 Claude 경로를 호환 지원하지만 Codex와 Antigravity의 공식 공통 프로젝트 경로는
`.agents/skills`다. 제품 하나의 이름을 범용 정본에 남기므로 기각한다.

### D. 즉시 플러그인 하나로 배포

Codex 배포에는 유리하지만 Claude Code·Antigravity·Cursor의 동일 설치 계약을 곧바로 해결하지 못한다.
저장소 범위 동기화가 안정된 뒤 별도 배포 결정으로 검토한다.

## 결과 (Consequences)

### 장점

- Antigravity·Codex·Cursor가 같은 저장소 Skill을 직접 읽는다.
- Claude Code 사본도 같은 정본에서 생성돼 안전 불변식 drift를 검사할 수 있다.
- 신규 프로젝트의 Cursor 전용 중복 Skill 생성이 사라진다.
- 사용자 수정본을 보존하면서도 관리본과 사용자본을 명확히 구분할 수 있다.

### 비용과 위험

- 기존 Cursor 5종 템플릿과 두 쌍의 저장소 Skill을 한 번 이관해야 한다.
- 공통 본문에서 벤더 전용 호출을 제거하면 일부 호스트 기능이 얇은 어댑터로 이동한다.
- 기존 `.cursor/skills` 사용자에게 중복 발견 경고와 명시적 이관 절차가 필요하다.
- 공식 문서가 바뀌면 발견 경로 호환표와 검증 fixture를 갱신해야 한다.

## 구현 전제와 검증

이 ADR과 구현 Plan은 2026-08-29 사람 승인을 받았다.

1. VHK-owned Skill 목록과 지원 플랫폼을 manifest로 고정한다.
2. `.agents/skills` 정본에서 관리 투영을 만드는 결정론 생성기를 둔다.
3. 정본↔Claude 투영의 안전 불변식·버전·해시 drift 테스트를 추가한다.
4. Cursor 신규 설치는 `.agents/skills`를 사용하고 기존 사용자 수정본 보존 테스트를 유지한다.
5. Antigravity·Claude Code·Codex·Cursor 각각의 공식 발견 경로 fixture를 검사한다.
6. `vhk sync --check`, typecheck, 전체 테스트, build, 공개 경계 검사를 통과한다.

## 미해결 위험과 사람 게이트

- 기존 관리형 `.cursor/skills`의 삭제·이동은 별도 사람 승인 전 수행하지 않는다.
- 플랫폼 전용 `auto-merge`를 다른 호스트로 확장할지는 이 ADR의 결정이 아니다.
- ADR 승인, 구현 Plan 승인, PR Ready·merge·publish는 각각 사람 게이트다.
