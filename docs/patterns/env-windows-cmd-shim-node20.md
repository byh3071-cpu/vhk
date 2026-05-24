---
패턴명: Windows .cmd shim 호출은 cmd.exe /d /s /c로 래핑
카테고리: env
출처프로젝트: VHK (vhk-cli)
태그: [Node.js, Windows, CVE-2024-27980, execFileSync, child_process]
발견일: 2026-05-24
출처DevLog: docs/log/2026-05-24-v0.8-release.md
---

# 패턴: Windows `.cmd` shim 호출은 `cmd.exe /d /s /c`로 래핑

## 증상

Node 20.12+ / 21.7+에서 Windows .cmd / .bat shim (`pnpm.cmd`, `npm.cmd`, `npx.cmd`, `yarn.cmd`, `tsc.cmd` 등) 호출 시:

```
spawnSync pnpm.cmd EINVAL
```

`execFileSync` 또는 `spawn(no-shell)`로 즉시 EINVAL 실패.

## 원인

**CVE-2024-27980** 보안 패치 — Windows에서 `.cmd` / `.bat` 파일을 `execFile`로 직접 호출 시 argv 이스케이프 검증 강화. 이전엔 spawn이 내부적으로 cmd.exe 호출했으나 패치 후 거부.

## 해결

```ts
import { execFileSync } from 'node:child_process'

const SHIM_BINARIES = new Set(['pnpm', 'npm', 'npx', 'yarn'])

function resolveCmd(cmd: string, args: string[]): { bin: string; argv: string[] } {
  if (process.platform === 'win32' && SHIM_BINARIES.has(cmd)) {
    return { bin: 'cmd.exe', argv: ['/d', '/s', '/c', `${cmd}.cmd`, ...args] }
  }
  return { bin: cmd, argv: args }
}

function safeExec(cmd: string, args: string[]) {
  const { bin, argv } = resolveCmd(cmd, args)
  return execFileSync(bin, argv, { encoding: 'utf-8' })
}
```

### `cmd.exe` 옵션

- `/d` — AutoRun 무시 (레지스트리 명령 인젝션 방지)
- `/s` — 따옴표 처리 강화
- `/c` — 명령 실행 후 종료

## 대안 비교

| 방법 | 장점 | 단점 |
|------|------|------|
| `shell: true` | 짧음 | Node DEP0190 경고 + argv 미escape (injection 위험) |
| `cmd.exe /d /s /c` 래핑 | shell:false 유지, argv 안전 | 한 줄 늘어남 |
| `spawn` + 수동 escape | 최저레벨 제어 | 복잡 + Windows quoting 함정 |

cmd.exe 래핑이 안전·간결.

## 적용 조건

- ✅ Windows 환경에서 Node 20.12+ / 21.7+ 사용
- ✅ pnpm / npm / npx / yarn / tsc 등 .cmd shim 호출
- ✅ `execFileSync` / `spawnSync` 직접 사용 (shell:false)
- ❌ Linux / macOS — 영향 없음
- ❌ 이미 cmd.exe 등 native exe 호출 — 영향 없음

## 검증

```ts
// tests/exec.test.ts
it('safeExecFile: Windows .cmd shim 실행 (CVE-2024-27980 회귀 방지)', () => {
  const result = safeExecFile('pnpm', ['--version'])
  expect(result.ok).toBe(true)
  expect(result.out).toMatch(/^\d+\.\d+\.\d+/)
})
```

## 참고

- CVE-2024-27980: https://nvd.nist.gov/vuln/detail/CVE-2024-27980
- Node 보안 패치: https://nodejs.org/en/blog/vulnerability/april-2024-security-releases
