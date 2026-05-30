---
패턴명: 콘텐츠 동등성 비교 전 CRLF→LF 정규화로 거짓 드리프트 차단
카테고리: git
출처프로젝트: VHK (vhk-cli)
태그: [crlf, lf, line-ending, autocrlf, gitattributes, normalization, drift-detection, content-comparison]
발견일: 2026-05-30
출처DevLog: docs/log/2026-05-30-v1.6.0-drift-cloud-robustness.md
---

# 패턴: 콘텐츠 동등성 비교 전 줄바꿈(CRLF→LF) 정규화로 거짓 드리프트 차단

## 증상

디스크에 저장된 파일과 "기대값(재생성/스냅샷/템플릿 출력)"을 문자열로 직접 비교하는 검증 로직이, 내용은 완전히 동일한데도 계속 "변경됨 / 불일치 / 드리프트"로 판정한다.

- Windows 개발자만 실패하고 macOS/Linux 동료는 통과하거나, CI는 통과하는데 로컬만 실패한다.
- diff 를 떠 보면 줄 내용은 같고 줄바꿈만 다르다. 눈으로는 차이가 안 보인다.

```text
# "갓 생성한 직후"인데도 불일치로 뜸
expected (재생성, LF):  "rule a\nrule b\n"
actual   (디스크, CRLF): "rule a\r\nb\r\n"   ← \r 때문에 === 가 false
```

```ts
// 흔한 버그 패턴: 줄바꿈을 그대로 둔 채 === 로 비교
const expected = template.generate(...)            // 코드가 만든 문자열 → LF
const actual = fs.readFileSync(fullPath, 'utf-8')  // 디스크 파일 → CRLF
const drifted = expected !== actual                // 항상 true (거짓 드리프트)
```

## 원인

`core.autocrlf=true`(Windows Git 기본값에 가까움) 환경에서 레포에 `.gitattributes` 가 없으면, Git 은 체크아웃 시 텍스트 파일의 LF 를 CRLF 로 변환해서 디스크에 쓴다. 반면 코드가 런타임에 만들어내는 "기대 문자열"(템플릿 렌더링, 직렬화, 재생성 결과)은 거의 항상 LF 다.

따라서 같은 논리적 내용이라도 디스크본은 `\r\n`, 기대본은 `\n` 이 되어 바이트 단위 `===` 가 어긋난다. 추가로 에디터/툴마다 다른 trailing whitespace, 파일 끝 빈 줄 개수, BOM(`﻿`) 도 같은 종류의 "내용은 같은데 바이트는 다른" 거짓 불일치를 만든다.

핵심: **콘텐츠 동등성**(내용이 같은가)을 묻고 싶은데 **바이트 동등성**(인코딩 표현까지 같은가)으로 비교하면, 플랫폼/도구 차이가 그대로 거짓 양성으로 새어 나온다.

## 해결

비교 직전에 **양쪽 문자열 모두**를 같은 규칙으로 정규화한 뒤 비교한다. 줄 내부 내용은 절대 건드리지 않고, 표현 차이(줄바꿈/끝 공백/끝 빈 줄)만 제거한다.

vhk-cli 의 실제 구현 (`src/lib/drift.ts`):

```ts
/**
 * 비교용 정규화 — CRLF→LF + 끝 공백/빈줄 제거.
 * `.gitattributes` 없고 core.autocrlf=true 인 환경에서 디스크 파일이 CRLF 로 체크아웃되어
 * LF 재생성본과 매번 어긋나는 **거짓 드리프트**를 막는다. (줄 내용은 안 건드림.)
 */
export function normalizeForCompare(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '\n')
}
```

세 단계의 의미:

- `.replace(/\r\n/g, '\n')` — CRLF→LF 통일 (autocrlf 거짓 드리프트의 주원인 제거)
- `.replace(/[ \t]+$/gm, '')` — 각 줄 끝의 공백/탭 제거 (`m` 플래그로 모든 줄에 적용)
- `.replace(/\n+$/, '\n')` — 파일 끝 빈 줄을 하나로 정규화

비교하는 쪽은 **반드시 양쪽 다** 정규화해야 한다. 한쪽만 정규화하면 거짓 불일치가 남는다 (`src/lib/drift.ts` 의 `checkRuleDrift`):

```ts
const expected = normalizeForCompare(target.generate(sections, projectName))
const actual = normalizeForCompare(fs.readFileSync(fullPath, 'utf-8'))
results.push({ path: target.path, status: expected === actual ? 'ok' : 'drifted' })
```

BOM 까지 방어해야 한다면 선두 `﻿` 제거를 한 단계 더 붙인다 (`.replace(/^﻿/, '')`).

근본 예방책으로 레포에 `.gitattributes` 를 두어 텍스트 파일의 줄바꿈을 고정하는 것도 권장된다 (예: `* text=auto eol=lf`). 다만 이건 새 체크아웃에만 적용되고 이미 받은 작업트리에는 소급되지 않으므로, **비교 로직 자체의 정규화가 1차 방어선**이다.

## 적용 조건

- ✅ 디스크 파일 vs 코드가 만든 기대 문자열(템플릿/재생성/스냅샷)을 동등성 비교할 때
- ✅ 멀티 플랫폼(Windows + macOS/Linux) 협업으로 줄바꿈이 섞일 수 있는 레포
- ✅ `.gitattributes` 가 없거나 `core.autocrlf` 설정이 개발자마다 제각각인 환경
- ✅ "변경 감지 / 드리프트 / 동기화 필요" 류의 읽기 전용 판정 로직
- ❌ 바이트 단위 정확성이 본질인 경우 (체크섬 검증, 서명 대상 원문, 바이너리 파일) — 이때는 정규화하면 안 됨
- ❌ 줄바꿈 스타일 자체를 검사·강제하는 린터/포매터 (CRLF 존재 여부가 판정 대상이므로 지우면 안 됨)
- ❌ 정규화 규칙을 한쪽 비교 대상에만 적용 (양쪽 동일 적용이 아니면 효과 없음)

## 검증

`tests/drift.test.ts` 가 정규화 자체와 실제 드리프트 판정에서의 동작을 모두 검증한다.

```ts
describe('normalizeForCompare', () => {
  it('CRLF→LF 통일 — autocrlf 거짓 드리프트 방지', () => {
    expect(normalizeForCompare('a\r\nb\r\n')).toBe(normalizeForCompare('a\nb\n'))
  })
  it('끝 공백/빈줄 차이 무시', () => {
    expect(normalizeForCompare('a\nb   \n\n\n')).toBe(normalizeForCompare('a\nb\n'))
  })
  it('내용 차이는 유지', () => {
    expect(normalizeForCompare('a\nb')).not.toBe(normalizeForCompare('a\nc'))
  })
})
```

실제 파일을 CRLF 로 다시 써도 드리프트로 오탐하지 않음을 확인하는 통합 테스트:

```ts
it('CRLF 로 체크아웃돼도 ok (정규화)', () => {
  const cursor = path.join(dir, '.cursorrules')
  const crlf = fs.readFileSync(cursor, 'utf-8').replace(/\n/g, '\r\n')
  fs.writeFileSync(cursor, crlf, 'utf-8')
  const r = checkRuleDrift(dir)
  expect(r.results.find(x => x.path === '.cursorrules')?.status).toBe('ok')
})
```

마지막 "내용 차이는 유지" 케이스가 핵심 안전망이다 — 정규화가 줄바꿈/공백만 지우고 **진짜 내용 차이는 보존**함을 보장하여, 거짓 양성을 없애면서 진짜 드리프트를 놓치지 않는다.
