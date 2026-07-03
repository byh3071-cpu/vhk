---
패턴명: 릴리즈 CLI 강제 버전 범프 — pre-set 버전 발행 불가
카테고리: build
출처프로젝트: VHK (vhk-cli)
태그: [npm, publish, release, semver, version-bump, CLI]
발견일: 2026-06-03
출처DevLog: Notion Dev Log `vhk-pattern-release-tool-forced-bump`
---

# 패턴: 릴리즈 CLI 가 버전을 항상 범프하면 pre-set 버전을 발행 못 한다

## 증상

릴리즈 PR 에서 `package.json` 버전을 목표값(예: `2.0.0`)으로 **미리** 올려두고 머지한 뒤, 릴리즈 CLI(`vhk publish`, 유사 도구)로 발행하면 — npm 에 **`2.0.0` 이 아니라 `2.0.1` 이 올라간다.**

```text
📌 현재 버전: v2.0.0
? 버전을 어떻게 올릴까요? 🔧 patch (2.0.1)   ← "그대로 발행" 선택지가 없음
🆕 새 버전: v2.0.1
```

결과: npm 발행 이력이 `1.9.0 → 2.0.1` 로 점프, **`2.0.0` 은 영영 공백.** CHANGELOG `[2.0.0]`·수동 git tag `v2.0.0` 과 불일치 잔재 발생.

## 원인

릴리즈 CLI 가 발행 절차에 **버전 범프를 강제**(patch/minor/major 중 택1)하도록 설계됨. `package.json` 이 이미 목표 버전(npm 미발행 상태)이어도 "**현재 버전 그대로 발행**" 옵션이 없어서, 가장 작은 patch 범프가 적용되며 의도한 버전을 건너뛴다.

```
의도: package.json=2.0.0(미발행) → publish → npm 2.0.0
현실: package.json=2.0.0 → publish(강제 patch) → npm 2.0.1, 2.0.0 공백
```

기능상으로는 무해하다(major=2 가 breaking 신호 역할). 하지만 **버전 번호 일관성**(npm ↔ CHANGELOG ↔ git tag)이 깨진다.

## 해결

**릴리즈 PR 에서 `package.json` 버전을 미리 올리지 않는다.** 직전 발행 버전을 그대로 두고, `vhk publish` 의 major/minor/patch 선택이 **곧 발행 버전이 되게** 한다.

```
권장: package.json=1.9.0 유지 → publish 시 major 선택 → npm 2.0.0
```

- breaking 릴리즈 → publish 시 `major`
- 기능 추가 → `minor`, 버그픽스 → `patch`
- CHANGELOG/태그는 **발행 후** 실제 발행 버전에 맞춰 기록(발행 전 박제 금지)

(향후 개선) 릴리즈 CLI 에 "현재 버전 그대로 발행(no bump)" 옵션 추가하면 pre-set 워크플로도 지원 가능.

## 핵심 원리

**버전을 정하는 주체는 하나여야 한다.** 릴리즈 PR(파일 편집)과 publish CLI(범프) 둘 다 버전을 만지면 충돌 → 한쪽이 의도를 덮는다. 범프를 CLI 가 강제한다면 파일 쪽은 버전을 건드리지 말 것(단일 SoT).

## 적용 조건

- ✅ 버전 범프를 강제하는 릴리즈 CLI(`npm version` 래핑류) 사용 시
- ✅ 메이저/특정 버전을 의도적으로 찍고 싶을 때
- ❌ CLI 가 "현재 버전 발행" 또는 "버전 직접 입력"을 지원하면 해당 없음
- ⚠️ 이미 잘못 발행했으면 되돌리기 어려움(npm 은 하위 버전 재발행해도 latest 안 바뀜) → 수용하고 잔재(CHANGELOG/tag)만 정합

## 검증

릴리즈 후: `npm view <pkg> versions` 로 의도한 버전이 실제 올라갔는지, `git tag` 와 CHANGELOG 헤딩이 일치하는지 확인.

## 참고

- VHK v2.0.0 → 실제 npm 발행은 2.0.1(이후 심링크 픽스로 2.0.2). CHANGELOG `[2.0.0]`→`[2.0.1]` 정합 + 거짓 `v2.0.0` 태그 삭제로 사후 수습.
- 관련 패턴: [auth-npm-scoped-publish-404.md](./auth-npm-scoped-publish-404.md)
