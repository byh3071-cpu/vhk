#!/usr/bin/env node
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
const root = process.cwd();
const ok = [], fail = [];
const read = (p) => existsSync(join(root, p)) ? readFileSync(join(root, p), "utf8") : null;
const must = (c, m) => (c ? ok : fail).push(m);

// ── 파일 + 모드 + 정책 엔진 ───────────────────────────────
const safety = read("src/lib/safety-mode.ts");
const config = read("src/lib/config.ts");
const policy = read("src/lib/risk-policy.ts");
const guard = read("src/lib/safety-guard.ts");
must(safety && /lite/.test(safety) && /standard/.test(safety) && /strict/.test(safety), "lite/standard/strict 모드");
must(safety && /DEFAULT_SAFETY_MODE\s*[:=][^\n]*["']standard["']/.test(safety), "기본 모드 standard (코드 기본값)");
must(config && /readConfig/.test(config) && /writeConfig/.test(config) && /config\.json/.test(config), "config read/write");
must(existsSync(join(root, "src/commands/mode.ts")) && existsSync(join(root, "src/commands/verify.ts")), "mode/verify 커맨드");
const HIGH = ["undo", "deploy", "publish", "migrate", "cloud", "resume", "env", "delete"];
must(policy && /HIGH_RISK_ACTIONS/.test(policy) && HIGH.every((a) => policy.includes(a)), "high-risk 8종 단일 레지스트리");
must(policy && /resolveGuard/.test(policy) && /["']cli["']/.test(policy) && /["'](mcp|nl)["']/.test(policy), "resolveGuard 채널 분기");

// ── 단일 chokepoint runGuarded 존재 ───────────────────────
must(guard && /export\s+async\s+function\s+runGuarded/.test(guard), "runGuarded 단일 chokepoint 존재");
must(guard && /confirm/.test(guard) && /approved/.test(guard) && /preview|미리보기/.test(guard), "runGuarded: CLI confirm + 명시승인 + preview 비실행");

// ── 구조: high-risk 진입점이 runGuarded 를 경유(배선 누락 없음) ──
const idx = read("src/index.ts") || "";
const EXECUTING = ["deploy", "publish", "migrate", "env-write", "cloud-pull"];
must(EXECUTING.every((a) => idx.includes(`guardCli('${a}'`)), "CLI high-risk(deploy/publish/migrate/env-write/cloud-pull) 가 guardCli 경유");
must(/runGuarded/.test(idx), "index.ts guardCli → runGuarded");
const nlp = read("src/lib/nlp-run.ts") || "";
must(/runGuarded/.test(nlp) && /NL_RISK_ACTION/.test(nlp), "자연어 dispatch high-risk → runGuarded(비차단 버그 제거)");
must(!/function nlSafetyNotice/.test(nlp), "비차단 nlSafetyNotice 함수 제거됨");

// ── MCP: high-risk 툴 기본 비실행(info-only / dry-run) ─────
const server = read("src/mcp/server.ts") || "";
must(/기본은 미리보기|기본 dry-run|미리보기만|confirm:\s*true 일 때만/.test(server), "MCP undo 기본 dry-run(미리보기)");
must(/실제 배포는 터미널|실제 배포 미수행|실제 npm publish 미수행|실제 전환 미수행/.test(server), "MCP deploy/publish/migrate 정보 조회만(실행 X)");

// ── 행동 e2e: standard + 확인 없이 vhk deploy → 실행 안 됨 ──
const bin = join(root, "dist", "index.js");
if (!existsSync(bin)) {
  fail.push("dist/index.js 없음 — pnpm run build 먼저 (행동 e2e 불가)");
} else {
  const tmp = mkdtempSync(join(tmpdir(), "vhk-g6-"));
  writeFileSync(join(tmp, "package.json"), JSON.stringify({ name: "tp", version: "0.0.0" }), "utf8");
  const r = spawnSync(process.execPath, [bin, "deploy"], { encoding: "utf8", cwd: tmp, env: { ...process.env, NO_COLOR: "1" } });
  const out = String(r.stdout || "") + String(r.stderr || "");
  rmSync(tmp, { recursive: true, force: true });
  must(/위험 작업\(deploy\)/.test(out) && /실행하지 않/.test(out) && !/어떤 플랫폼에 배포/.test(out), "행동: standard + 확인없음 deploy → 차단(실행 안 됨)");
}

// ── R1 가드 + 드리프트 테스트(신규 컨테이너까지) ──────────
const cliArgs = read("src/lib/cli-args.ts") || "";
must(/isRealSubcommandPath/.test(cliArgs) && /command-registry/.test(cliArgs), "R1 가드 + registry 단일소스 파생");
const driftTest = read("tests/command-registry.test.ts") || "";
must(existsSync(join(root, "tests/command-registry.test.ts")) && /신규 컨테이너|새 컨테이너|program\.commands/.test(driftTest), "드리프트 가드 테스트(신규 컨테이너 명령 포함)");
const g5 = read("scripts/check-goal-5.mjs") || "";
must(/isRealSubcommandPath/.test(g5), "check-goal-5 코드구조 검증");

console.log(ok.map((m) => "  ✓ " + m).join("\n"));
if (fail.length) { console.error("\n[check-goal-6 FAIL]\n" + fail.map((m) => "  ✗ " + m).join("\n")); process.exit(1); }
console.log("\n[check-goal-6 PASS]");
