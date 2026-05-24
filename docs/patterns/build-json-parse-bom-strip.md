---
패턴명: JSON.parse 호출 전 UTF-8 BOM 제거 (Windows PowerShell 호환)
카테고리: build
출처프로젝트: VHK (vhk-cli)
태그: [Node, JSON, Windows, PowerShell, BOM, encoding]
발견일: 2026-05-24
출처DevLog: docs/log/2026-05-24-v1.0.1-hotfix.md
---

# 패턴: `JSON.parse` 전에 UTF-8 BOM 제거

## 증상

Windows 사용자가 PowerShell로 `package.json`, `tsconfig.json`, `mcp.json` 등을 만지면 도구가 침묵 실패한다.

```text
vhk harness
🔧 통합 품질 점검
⚠️  실행할 수 있는 스크립트가 없습니다.   ← scripts 진짜로 있는데!
```

증상 패턴:

- "필드 없음"으로 보고하지만 실제로는 있음
- `try/catch`로 감싼 `JSON.parse` 블록이 silent로 빈 객체 반환
- macOS/Linux에선 재현 안 됨

## 원인

Windows PowerShell 5.1의 `Out-File -Encoding utf8`, `Set-Content -Encoding utf8`은 **UTF-8 BOM (`EF BB BF`)을 강제로 prepend**한다. (PowerShell 7+은 기본 `utf8NoBOM`이지만 5.1은 여전히 시스템 표준)

```powershell
'{ "name": "x" }' | Out-File -Encoding utf8 package.json
# 결과 바이트: EF BB BF 7B 22 6E 61 6D 65 ...
```

Node의 `JSON.parse`는 입력 첫 글자가 BOM(`﻿`)이면 throw한다.

```ts
JSON.parse('﻿{"a":1}')
// SyntaxError: Unexpected token  in JSON at position 0
```

호출자가 `try/catch`로 throw를 묻고 빈 결과를 반환하면 사용자에겐 "필드 없음"으로 보임 → 원인 추적 불가.

## 해결

`readFileSync` 결과를 `JSON.parse` 넘기기 전에 BOM strip. 헬퍼로 중앙화하면 모든 호출자가 안전.

```ts
// src/lib/read-json.ts
import { readFileSync } from 'node:fs'

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

export function readJsonFile<T>(filePath: string): T {
  const raw = stripBom(readFileSync(filePath, 'utf-8'))
  return JSON.parse(raw) as T
}
```

호출자는 native pattern 대신 helper 사용.

```ts
// 변경 전 (BOM 시 throw → silent catch)
const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))

// 변경 후
import { readJsonFile } from '../lib/read-json.js'
const pkg = readJsonFile<{ scripts?: Record<string, string> }>('package.json')
```

## 핵심 원리

**bytes-on-disk와 JSON.parse 사양의 mismatch**를 호출자가 흡수.

- JSON 표준(RFC 8259)은 BOM "허용"이지만 strict mode에선 제거 권장
- Node `JSON.parse`는 strict — BOM throw
- 입력은 외부 환경(Windows PowerShell, 사용자 에디터)에 의존 → 통제 불가
- 따라서 boundary에서 sanitize

## 적용 조건

- ✅ Node.js + JSON 파일 read하는 모든 CLI/툴
- ✅ Windows 지원이 필관리자 모든 도구
- ✅ 사용자가 직접 만든 설정 파일(.json) 파싱
- ❌ JSON 입력이 항상 자기가 만든 출력만 받는 경우 (e.g., HTTP API 응답) — 그 경우는 BOM 불가
- ⚠️ 다른 잠재 인코딩 이슈(UTF-16, Latin-1)는 별도 처리 필요. BOM strip 하나로 모든 인코딩 문제가 해결되는 건 아님

## 추가 발견: silent catch의 위험

원래 코드는 try/catch로 throw를 묻고 빈 결과 반환했다. 이게 BOM 버그를 가렸다.

```ts
try {
  pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
} catch {
  return checks   // ← 사용자는 왜 비었는지 모름
}
```

근본 수정과 별개로, **silent catch는 진단 메시지 출력**하거나 에러 종류별 분기해야 한다. 글로벌 규칙 "근본 원인 찾기" 원칙과도 일치.

## 검증

회귀 테스트로 lock — BOM 포함 입력에서 정상 동작 보장.

```ts
it('UTF-8 BOM이 있어도 정상 파싱', async () => {
  mockReadFileSync.mockReturnValue(
    '﻿' + JSON.stringify({ scripts: { lint: 'eslint', test: 'vitest' } })
  )
  const { harness } = await import('../src/commands/harness.js')
  await harness()
  expect(mockSafeExecFile).toHaveBeenCalledTimes(2)  // lint + test
})
```

## 참고

- VHK `src/lib/read-json.ts` 헬퍼
- v1.0.1 hotfix에서 `harness`, `doctor`, `init`, `mcp-init`, `publish`, `update`, `mcp/server.ts`(2곳), `ref` 9 사이트 일괄 마이그레이션
- 관련 패턴: [env-windows-cmd-shim-node20.md](./env-windows-cmd-shim-node20.md) — Windows 환경 호환성 시리즈
