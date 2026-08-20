---
id: PAT-006
패턴명: 정규식으로 주석·문자열을 걷어내는 코드 검사는 중첩 인용에서 무너진다
카테고리: test
증상: 금지 API 사용을 막는 검사(lint·게이트)가 두 방향으로 동시에 틀린다. 문자열 리터럴 안에 든 코드 예시를 실제 사용으로 오탐해 멀쩡한 파일을 막고, 반대로 템플릿 치환식 `${fn(x)}` 안의 진짜 호출은 통째로 놓쳐 우회 통로가 된다. 특히 그 검사를 검증하는 테스트 파일이 자기 자신에게 걸린다 — 테스트는 금지 API 사용 예시를 문자열로 담기 때문이다.
원인: `content.replace(/`[^`]*`/g, '')` 류로 주석·문자열을 지우는 전처리는 인용 부호의 중첩을 모른다. 작은따옴표 문자열 안의 백틱을 템플릿 시작으로 읽거나, 템플릿 전체를 지우면서 그 안의 치환식(진짜 코드)까지 날린다. 어느 순서로 치환해도 반대 방향 오류가 남는다 — 정규식은 재귀 구조를 표현하지 못한다.
해결: ①존재 여부만 보는 검사는 정규식으로 충분하다 ②건수를 세거나 baseline 과 대조하는 검사는 파서를 쓴다. TypeScript 프로젝트면 `ts.createSourceFile(name, content, ScriptTarget.Latest, true)` 후 `ts.forEachChild` 로 `CallExpression` 을 순회한다. 호출부 이름은 `PropertyAccessExpression`(`fs.rmSync`)·`Identifier`(직접 호출·별칭 import) 양쪽을 봐야 하고, 별칭은 `ImportDeclaration` 의 `propertyName`/`name` 쌍에서 모은다. ③파서 도입 전에 "검사를 검증하는 테스트"를 먼저 써라 — 오탐·미탐이 거기서 드러난다.
적용조건: 소스 코드를 텍스트로 읽어 금지 패턴을 찾는 모든 게이트·lint·마이그레이션 스크립트. 특히 잔존 건수를 baseline 으로 관리하는 점진적 금지 규칙에서는 카운트가 1건만 어긋나도 baseline 정합이 깨진다.
출처프로젝트: vhk
태그: [lint, gate, regex, ast, typescript, false-positive, tooling]
발견일: 2026-08-18
출처DevLog: docs/devlog/2026-08-18-ts005-test-guard.md
---

# PAT-006: 정규식으로 주석·문자열을 걷어내는 코드 검사는 중첩 인용에서 무너진다

## 증상

`fs.rmSync` 신규 사용을 막는 게이트를 만들었다. 주석·문자열 안의 언급은 위반이 아니므로 전처리로 걷어냈다.

```js
function stripCommentsAndStrings(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
}
```

두 방향으로 동시에 틀렸다.

**오탐** — 게이트를 검증하는 테스트가 자기 자신에게 걸렸다. 테스트는 금지 API 사용 예시를 문자열로 담는다.

```ts
fs.writeFileSync(f, 'import { rmSync } from "node:fs"\nrmSync("/tmp/x")\n')
```

import 존재 검사를 원본 문자열에 돌리면 이게 실제 import 로 잡힌다.

**미탐** — 백틱 전체를 지우니 템플릿 치환식 안의 진짜 호출이 사라졌다.

```ts
export const s = `x${fs.rmSync('/tmp/x')}y`   // 게이트가 0건으로 센다
```

치환 순서를 바꿔도 반대 방향 오류가 남는다. 작은따옴표를 먼저 지우면 템플릿 안의 어포스트로피가 문자열 시작이 된다.

## 원인

정규식은 재귀 구조를 표현하지 못한다. 인용 부호의 중첩은 재귀다.

## 해결

**존재 여부만 보면 정규식으로 충분하다.** "이 파일이 금지 API 를 쓰는가"는 오탐이 나도 사람이 바로 알아본다.

**건수를 세면 파서를 써라.** 잔존 건수를 baseline 으로 관리하는 점진적 금지 규칙에서는 1건만 어긋나도 정합이 깨진다.

```js
import ts from 'typescript'

function countCalls(content, fileName, target) {
  const source = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true)
  const names = new Set([target])
  let calls = 0

  // 별칭 import 는 호출부 이름이 달라진다 — 이걸 놓치면 실제보다 적게 잡힌다.
  const collectImports = (node) => {
    if (ts.isImportDeclaration(node) && node.importClause?.namedBindings) {
      const bindings = node.importClause.namedBindings
      if (ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) {
          if ((el.propertyName?.text ?? el.name.text) === target) names.add(el.name.text)
        }
      }
    }
    ts.forEachChild(node, collectImports)
  }
  collectImports(source)

  const countNode = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      if (ts.isIdentifier(callee) && names.has(callee.text)) calls += 1
      else if (ts.isPropertyAccessExpression(callee) && callee.name.text === target) calls += 1
    }
    ts.forEachChild(node, countNode)
  }
  countNode(source)
  return calls
}
```

`typescript` 가 이미 devDependency 라면 추가 비용이 없다. 게이트 스크립트는 배포물에 들어가지 않으므로 런타임 의존도 늘지 않는다.

## 순서가 중요하다

**검사를 검증하는 테스트를 먼저 써라.** 이 사례에서 오탐을 처음 드러낸 것은 게이트 자체가 아니라 게이트를 검증하는 테스트였다. 테스트는 금지 API 사용 예시를 문자열로 담을 수밖에 없어서, 전처리의 결함이 가장 먼저 나타나는 자리다.

## 곁다리 — 게이트는 검사 대상이 고칠 수 없어야 한다

같은 작업에서 나온 별개 교훈. PR 이 자기를 검사하는 게이트 스크립트를 수정할 수 있으면 게이트가 아니다. CI 에서는 base 판본을 꺼내 실행한다.

```yaml
- run: git show "$BASE_SHA:scripts/gate.mjs" > "$RUNNER_TEMP/gate.mjs"
- run: node "$RUNNER_TEMP/gate.mjs" "$BASE_SHA" "$HEAD_SHA"
```
