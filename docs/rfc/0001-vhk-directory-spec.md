---
rfc: 1
title: "`.vhk/` 디렉토리 규격 (Portable Project State for AI Coding)"
status: Proposed
author: VHK
created: 2026-05-30
normative_ref: docs/spec.md
spec_version: "1.0"
discussion: https://github.com/byh3071-cpu/vhk/issues/38
---

# RFC 0001 — `.vhk/` 디렉토리 규격

> 용어: ADR-011 대응표 참조.

> 이 RFC 는 공개 의견 수렴용 제안서다. **규범(normative) 정의는 [`docs/spec.md`](../spec.md)** 가 가지며,
> 본 문서는 그 규격의 **동기·설계 근거·대안·미해결 질문**을 설명한다. 둘이 어긋나면 `spec.md` 가 기준이다.

## 1. 요약 (Summary)

`.vhk/` 는 한 프로젝트 안에서 VHK CLI 가 읽고 쓰는 **로컬 상태 디렉토리**다. 하위 폴더 없는
평면(flat) 파일 모음으로, 프로젝트 맥락·브리핑·결정 메모·참고링크·안전 신호·클라우드 포인터를 담는다.

목적은 하나다 — **AI 코딩 도구나 컴퓨터를 바꿔도 프로젝트의 "기억"이 따라오게 한다.** 규칙은
`vhk sync` 로 여러 도구에, 맥락은 `vhk cloud` 로 기기 간에 옮긴다. `.vhk/` 는 그 맥락이 사는 곳이다.

## 2. 동기 (Motivation)

AI 코딩 도구가 늘면서 두 가지 마찰이 생겼다.

1. **도구마다 규칙 파일이 다르다.** `.cursorrules`, `CLAUDE.md`, `.windsurfrules`, Copilot/Antigravity
   설정… 같은 프로젝트 규칙을 도구 수만큼 따로 적고 따로 갱신한다.
2. **환경을 바꾸면 맥락이 사라진다.** 새 컴퓨터, 새 동료, 새 세션마다 "이 프로젝트가 뭐였지"를
   처음부터 다시 모은다. 코드는 `git clone` 으로 오지만, 그동안 쌓인 **결정·맥락·참고자료는 안 온다.**

VHK 는 이 둘을 분리해 푼다.

- **규칙(rules)** — `RULES.md` 한 벌에서 도구별 규칙 파일을 생성/동기화 (`vhk sync`).
- **맥락(context/state)** — `.vhk/` 디렉토리에 모으고, 기기 간 백업·복원 (`vhk cloud`).

이 RFC 는 후자, **`.vhk/` 의 구조와 계약**을 고정한다. 구조가 표준화돼야 cloud 백업·복원·외부 도구
연동이 안정적으로 가능하기 때문이다.

## 3. 가이드 설명 (비개발자 포함)

`.vhk/` = **이 프로젝트에서 VHK 가 기억하는 것들을 모아둔 폴더.**

- 맥락(`context.md`)·브리핑(`brief.md`) → 팀과 **공유**(git 커밋).
- 개인 메모(`memory.json`)·참고링크(`refs.json`) → **내 컴퓨터에만**(프라이버시).
- `HARD_STOP` 파일이 있으면 → **모든 자동 작업 즉시 정지**(안전 브레이크).
- `cloud.json` → 백업이 저장된 위치를 가리키는 **포인터**(비밀 아님).

핵심 원칙: **"공유할 것"과 "내 것만"을 폴더 구조로 명확히 가른다.** 그래서 백업을 떠도 개인 메모는
새지 않는다.

## 4. 규격 요약 (Reference)

> 전체 표·스키마는 [`docs/spec.md`](../spec.md) 가 정본. 여기선 계약의 핵심만.

### 4.1 파일 목록

| 파일 | 포맷 | 트래킹 | 생성 주체 | 목적 |
| --- | --- | --- | --- | --- |
| `README.md` | Markdown | ✅ 커밋 | `vhk init` 씨앗 | 폴더 안내 + 트래킹 정책 |
| `.gitignore` | gitignore | ✅ 커밋 | `vhk init` 씨앗 | 로컬 전용 파일을 폴더 단위로 무시 |
| `context.md` | Markdown | ✅ 커밋 | `vhk init` → `vhk context` | 프로젝트 맥락 (스택·구조·명령·결정) |
| `brief.md` | Markdown | ✅ 커밋 | `vhk brief` (lazy) | 상태 요약 브리핑 |
| `memory.json` | JSON | ❌ 로컬 전용 | `vhk memory add` (lazy) | 의사결정 메모 (개인/세션) |
| `refs.json` | JSON | ❌ 로컬 전용 | `vhk ref add` (lazy) | 참고 URL + 메모 |
| `HARD_STOP` | (빈 파일) | ❌ 로컬 전용 | 게이트/사용자 | 존재 시 모든 자동화 즉시 중단 |
| `cloud.json` | JSON | ✅ 커밋 | `vhk cloud push/pull` | 백업 gist 포인터 `{ "gistId": "..." }` |

루트의 `.vhkignore`(선택, 커밋)는 `vhk cloud push` 백업에서 제외할 `.vhk/` 파일을 한 줄에 하나씩
적는다. 기본 제외(자동): `memory.json`·`refs.json`·`HARD_STOP`·`cloud.json`·`.gitignore`.

### 4.2 트래킹 정책

- 공유용(`README.md`·`context.md`·`brief.md`) → 커밋 권장.
- 개인용(`memory.json`·`refs.json`) → `.gitignore` 로 로컬 전용.
- `HARD_STOP` → 로컬 안전 신호, 커밋 금지.

### 4.3 그 외 계약 (정본: [`spec.md`](../spec.md))

> 아래는 §5 근거가 참조하는 핵심만. 전체 정의·스키마는 정본 참조 — 중복 기술을 피해 드리프트를 막는다.

- **JSON 파일** (`memory.json`·`refs.json`): 배열 루트. 파싱 실패·비배열이면 **빈 배열 `[]` 로 간주**
  (관대한 읽기). `refs.json` 의 `url` 은 유니크. → `spec.md §2`
- **`HARD_STOP`**: 존재하기만 하면 모든 자동화 즉시 정지. 해제는 `vhk resume --confirm` 뿐. → `spec.md §3`
- **클라우드**: `vhk cloud push/pull` 로 공유 파일을 GitHub secret gist 에 백업/복원. 인증은 `gh`.
  개인 메모·참고링크·`HARD_STOP` 은 기본 제외. → `spec.md §3.5`

## 5. 설계 근거 & 대안 (Rationale & Alternatives)

### 5.1 왜 평면 파일인가

- **가독성·이식성:** 폴더 트리보다 `ls .vhk` 한 번에 전체 파악. 사람이 직접 열어 고치기 쉽다.
- **트래킹 단위가 명확:** 파일 = 정책 단위(공유/로컬). 폴더 중첩이면 `.gitignore` 규칙이 모호해진다.
- 대안(중첩 폴더 구조)은 `spec_version 2.0` 으로 미룬다 (§7).

### 5.2 왜 cloud 가 gist 인가

- 별도 서버·계정·과금 **없이** GitHub 인증(`gh`)을 재사용 → 토큰을 코드·파일에 두지 않는다.
- gist 는 **secret(unlisted)** 로 생성된다. 단 secret 은 접근제어가 아니라 "목록 비노출"일 뿐 —
  **gist id/URL 을 알면 누구나 무인증으로 읽을 수 있다.** push 는 `gh` 인증이 필요하지만 pull/read 는
  id 만 있으면 된다. 포인터(`cloud.json`)는 커밋되므로 레포 접근자는 백업 위치를 알게 된다.
- 따라서 프라이버시는 gist 의 비밀성이 **아니라**, 백업 대상에서 **개인 메모(`memory.json`)·참고링크
  (`refs.json`)·`HARD_STOP` 을 기본 제외**하는 것으로 보장한다. (그래서 `cloud.json` 은 "비밀 아님"으로 분류)
- 대안(전용 백엔드/S3): 운영 부담·과금·시크릿 관리 비용이 1인 개발 도구엔 과하다.

### 5.3 왜 memory/refs 는 로컬 전용인가

- 개인 의사결정 메모·참고링크에는 미공개 정보가 섞이기 쉽다 → 기본 커밋/백업에서 **빼는 게 안전한 기본값.**
- 공유가 필요하면 사용자가 명시적으로 `.vhkignore` 를 조정해 포함시킬 수 있다(옵트인).

### 5.4 왜 관대한 읽기(`[]` 폴백)인가

- 상태 파일 하나가 깨졌다고 CLI 전체가 죽으면 안 된다. 손상 시 빈 상태로 진행하고 다음 쓰기에서 회복.

## 6. 선행 연구 (Prior Art)

- **rulesync** — 단일 소스에서 여러 AI 도구 규칙 파일을 생성/동기화. VHK 의 `vhk sync` 와 같은 문제의식.
  VHK 는 여기서 더 나아가 **규칙뿐 아니라 맥락(`.vhk/`)까지** 이식 대상으로 본다.
- **dotfiles / `.editorconfig` / `.well-known/`** — 프로젝트 루트의 규약 파일로 도구 간 합의를 만든 전례.
- **`.git/`** — 도구가 소유하는 로컬 상태 디렉토리(전체 로컬, 원격으로만 공유)라는 모델의 원형.

차별점: `.vhk/` 는 "규칙"이 아니라 **"맥락과 결정"** 을 이식 단위로 삼고, 공유/로컬 경계를 폴더 정책으로 못박는다.

## 7. 미해결 질문 (Unresolved Questions)

1. **드리프트 감지(L2):** `.vhk/` 와 도구별 규칙 파일이 어긋났을 때 감지/경고하는 계약을 이 스펙에 넣을지.
2. **중첩 폴더 구조:** 파일이 늘면 평면 구조의 한계가 온다. `spec_version 2.0` 에서 폴더화 + 마이그레이션 경로.
3. **cloud 충돌 해소:** 두 기기에서 각각 push 했을 때 머지/최신우선 정책(현재는 마지막 push 우선).
4. **외부 도구 연동:** `.vhk/` 를 읽는 서드파티 규약(읽기 전용 계약)을 공식화할지.

## 8. 향후 가능성 (Future Possibilities)

- `vhk sync` 대상 도구는 v1.4.0 기준 Cursor·Claude·Windsurf·Copilot·Antigravity 5종(이미 출시) — 이후 도구 추가로 규칙 이식 폭을 계속 확장.
- `.vhk/` 를 입력으로 받는 외부 통합(에이전트·CI)이 기댈 안정 계약 제공.
- §7.1 드리프트 감지가 확정되면, 규칙 파일과 `.vhk/` 불일치를 경고하는 기능으로 이어진다.

## 9. 호환성 정책 (Compatibility)

- 기존 파일명·포맷은 GA 안정성 정책에 따라 **변경하지 않는다.**
- 새 파일 추가 시 `spec.md` 표·스키마에 **먼저 등록한 뒤** 구현한다.
- 평면→폴더 등 호환성 깨는 변경은 `spec_version` 을 올리고 마이그레이션 경로를 명시한다.
