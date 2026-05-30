#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
const root = process.cwd();
const ok = [], fail = [];
const read = (p) => existsSync(join(root, p)) ? readFileSync(join(root, p), "utf8") : null;
const must = (c, m) => (c ? ok : fail).push(m);

// ── 파일 존재 ─────────────────────────────────────────────
const config = read("src/lib/config.ts");
const safety = read("src/lib/safety-mode.ts");
const policy = read("src/lib/risk-policy.ts");
const mode = read("src/commands/mode.ts");
must(config, "config.ts 존재");
must(safety, "safety-mode.ts 존재");
must(policy, "risk-policy.ts 존재");
must(mode, "mode.ts 존재");
must(existsSync(join(root, "src/commands/verify.ts")), "verify.ts 존재(lite)");

// ── 세 모드 정의 ──────────────────────────────────────────
must(safety && /lite/.test(safety) && /standard/.test(safety) && /strict/.test(safety), "lite/standard/strict 모드 정의");
must(safety && /DEFAULT_SAFETY_MODE\s*[:=][^\n]*["']standard["']/.test(safety), "기본 모드 standard");

// ── config 읽기/쓰기 + config.json 경로 ───────────────────
must(config && /readConfig/.test(config) && /writeConfig/.test(config), "config read/write");
must(config && /config\.json/.test(config), "config.json 경로 참조");

// ── high-risk 8종 + 정책 분기 ─────────────────────────────
const HIGH = ["undo", "deploy", "publish", "migrate", "cloud", "resume", "env", "delete"];
must(policy && HIGH.every((a) => policy.includes(a)), "high-risk 8종 포함");
must(policy && /HIGH_RISK_ACTIONS/.test(policy), "HIGH_RISK_ACTIONS 목록");
must(policy && /resolveGuard/.test(policy), "정책 함수 resolveGuard");
must(policy && /confirm/.test(policy) && /preview/.test(policy), "confirm/preview 가드 분기");
must(policy && /["']cli["']/.test(policy) && /["'](mcp|nl)["']/.test(policy), "채널 분기(CLI=confirm vs MCP/자연어=preview)");

// ── .vhk/config.json 기본값 standard (없으면 코드 기본값으로 대체 검증) ──
const conf = read(".vhk/config.json");
must(
  conf ? /"safetyMode"\s*:\s*"standard"/.test(conf) : (safety && /DEFAULT_SAFETY_MODE/.test(safety)),
  ".vhk/config.json 기본 standard (또는 코드 기본값 standard)"
);

// ── R1 #1: 가드 코드 존재 + 드리프트 가드 테스트 ──────────
const cliArgs = read("src/lib/cli-args.ts") || "";
must(/isRealSubcommandPath/.test(cliArgs), "R1 가드 함수 isRealSubcommandPath 존재");
must(existsSync(join(root, "tests/command-registry.test.ts")), "R1 드리프트 가드 테스트 존재");

// ── R1 #2: check-goal-5 가 주석 grep 아니라 코드구조 검증 ──
const g5 = read("scripts/check-goal-5.mjs") || "";
must(/isRealSubcommandPath/.test(g5), "check-goal-5 가 isRealSubcommandPath 코드구조 검증으로 교체됨");

console.log(ok.map((m) => "  ✓ " + m).join("\n"));
if (fail.length) { console.error("\n[check-goal-6 FAIL]\n" + fail.map((m) => "  ✗ " + m).join("\n")); process.exit(1); }
console.log("\n[check-goal-6 PASS]");
