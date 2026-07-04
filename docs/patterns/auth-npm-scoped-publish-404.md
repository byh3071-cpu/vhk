---
패턴명: scoped npm publish E404 = 인증 실패 (401 아닌 404)
카테고리: auth
출처프로젝트: VHK (vhk-cli)
태그: [npm, publish, scoped-package, auth, 404, registry, 2FA]
발견일: 2026-06-03
출처DevLog: Notion Dev Log `vhk-pattern-npm-scoped-404-auth`
---

# 패턴: scoped npm publish 가 E404 면 십중팔구 인증 실패

## 증상

이미 npmjs 에 **공개 존재하는** scoped 패키지(`@scope/pkg`)를 `npm publish` 하는데 404 가 뜬다.

```text
npm error code E404
npm error 404 Not Found - PUT https://registry.npmjs.org/@byh3071%2fvhk
npm error 404 The requested resource '@byh3071/vhk@2.0.2' could not be found
npm error 404  or you do not have permission to access it.
```

함정: 직전에 같은 패키지의 **다른 버전 발행은 성공**했는데도 다음 버전에서 404. "패키지가 없나?" "레지스트리가 잘못됐나?" 로 오진하기 쉽다.

## 원인

npm 레지스트리는 **scoped 패키지의 인증 부재/무효를 존재 은폐를 위해 401 이 아니라 404 로 반환**한다(권한 없는 사용자에게 비공개 패키지의 존재 여부를 누설하지 않으려는 설계). 즉 `404 PUT` = "패키지 없음"이 아니라 대부분 "**자격증명이 거부됨**".

확인 신호:

```powershell
npm whoami        # → E401 Unauthorized 이면 인증 깨진 것
npm view @scope/pkg version   # 익명 읽기는 됨(패키지는 공개 존재) → 404 는 auth 문제 확정
```

흔한 트리거: **웹 인증(`npm login --auth-type=web`)은 `.npmrc` 의 영속 토큰을 갱신한다는 보장이 없다.** 한 번은 그 세션으로 발행되지만, `.npmrc` 에 남은 **만료/무효 토큰**이 그대로라 다음 publish 에서 다시 거부된다. (`.npmrc` 에 `_authToken` 라인이 "있어도" 무효일 수 있음 — 존재 ≠ 유효.)

## 해결

```powershell
# 1. 인증 상태부터 확인 (버전/레지스트리 의심 금지)
npm whoami                 # E401 이면 ↓
# 2. 재로그인 (2FA 면 OTP/웹 인증)
npm login                  # 또는 npm login --auth-type=legacy (장기 토큰 .npmrc 저장)
npm whoami                 # 본인 아이디 떠야 성공
# 3. 재발행
npm publish --access public
```

반복 발행 패키지/CI 는 npmjs.com 에서 **Granular Access Token**(publish 권한) 발급해 `.npmrc` 에 저장하면 안정적(단 토큰은 2FA 를 우회하므로 보안 트레이드오프 — 비밀로 관리).

## 핵심 원리

**404 ≠ "없음".** 인증·인가 계층이 존재 은폐를 위해 404 로 응답하는 API 가 있다(npm scoped, GitHub private repo 등). 외부 레지스트리가 404 를 주면 **자원 부재보다 자격증명을 먼저 의심**한다.

## 적용 조건

- ✅ scoped npm 패키지(`@scope/pkg`) publish 가 E404
- ✅ 웹 인증/OTP 로 한 번 발행 후 다음 발행이 실패
- ✅ CI 에서 npm publish 가 간헐적 404 (토큰 만료)
- ❌ 정말 미발행 버전을 **install** 하려다 404 (그건 진짜 부재일 수 있음 — publish PUT 404 와 구분)
- ⚠️ 같은 버전 재발행이면 403/409(중복)지 404 아님 — 버전은 항상 신규여야

## 재발 방지

- **publish 전 항상 `npm whoami`** (인증 체크를 발행 스크립트 prepublish 단계에 넣는 것도 고려)
- 404 떴을 때 디버그 순서: ① `npm whoami` ② `npm view <pkg>`(익명 읽기) ③ 그 다음에야 버전/레지스트리

## 참고

- VHK v2.0.2 발행 시 첫 시도 E404 → `npm login` 재인증 후 성공.
- 멀티에이전트 진단 종합본이 재인증 *후* 실행돼 "전파 지연"으로 오판한 사례 — 도구 출력도 타임라인 혼동 가능, 직접 검증 필요.
- 관련 패턴: [build-release-tool-forced-version-bump.md](./build-release-tool-forced-version-bump.md), [ux-publish-stdio-inherit.md](./ux-publish-stdio-inherit.md)
