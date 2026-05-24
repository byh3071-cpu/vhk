---
id: TS-001
date: 2026-05-24
project: VHK
category: env
severity: HIGH
---

# TS-001 — Windows `.cmd` shim `spawnSync EINVAL`

## 증상

```
✖ 빌드 실패
spawnSync pnpm.cmd EINVAL
```

`vhk publish` 실행 시 `pnpm build` 단계에서 즉시 종료. `npm publish`, `vhk deploy` (vercel CLI), `vhk doctor` (npm version check) 등 `.cmd` shim 호출하는 모든 명령에 영향.

## 원인

Node 20.12+ / 21.7+ **CVE-2024-27980** 보안 패치로 `child_process.execFileSync` (및 `spawn` no-shell 모드)가 Windows `.cmd` / `.bat` 파일 직접 호출 거부. EINVAL로 즉시 실패.

기존 코드:
```ts
execFileSync('pnpm.cmd', ['build'], { stdio: 'pipe' })
// → spawnSync EINVAL on Node 20.12+
```

## 해결

`cmd.exe /d /s /c` 래핑으로 호출. shell:false 유지하면서 .cmd 실행 가능.

```ts
function resolveCmd(cmd: string, args: string[]) {
  if (process.platform === 'win32' && SHIM_BINARIES.has(cmd)) {
    return { bin: 'cmd.exe', argv: ['/d', '/s', '/c', `${cmd}.cmd`, ...args] }
  }
  return { bin: platformCmd(cmd), argv: args }
}

// /d: AutoRun 무시
// /s: 따옴표 처리 강화
// /c: 명령 실행 후 종료
```

대안인 `shell: true`는 Node DEP0190 경고 + argv 미escape로 injection 위험. cmd.exe 직접 invoke가 안전.

## 적용 조건

- Node 20.12+ 또는 21.7+ 환경
- Windows에서 `.cmd` / `.bat` shim 호출 (pnpm/npm/npx/yarn 등)
- `execFileSync` / `spawnSync` 사용 시

## 관련 파일

- `src/lib/exec.ts` (resolveCmd 함수)
- `tests/exec.test.ts` (회귀 테스트: `safeExecFile('pnpm', ['--version'])`)

## 참고

- CVE-2024-27980: https://nvd.nist.gov/vuln/detail/CVE-2024-27980
- Node 패치: https://nodejs.org/en/blog/vulnerability/april-2024-security-releases
- PR #7 (c1c54ea)
