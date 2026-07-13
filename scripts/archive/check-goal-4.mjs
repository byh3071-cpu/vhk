#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
const root = process.cwd();
const ok = [], fail = [];
const read = (p) => existsSync(join(root, p)) ? readFileSync(join(root, p), "utf8") : null;
const must = (c, m) => (c ? ok : fail).push(m);
const sf = read("src/lib/state-files.ts");
must(sf && /getActiveBlockers/.test(sf), "getActiveBlockers");
must(sf && /getRecentBlockers/.test(sf), "getRecentBlockers");
const ctx = read("src/commands/context.ts");
must(ctx && /compact/i.test(ctx), "context --compact");
must(ctx && /(getActiveBlockers|blocker)/i.test(ctx), "context 가 active blockers 포함");
must(existsSync(join(root, "AGENTS.compact.md")) || existsSync(join(root, "docs/context/agent-compact.md")), "compact 규약 문서");
console.log(ok.map((m) => "  ✓ " + m).join("\n"));
if (fail.length) { console.error("\n[check-goal-4 FAIL]\n" + fail.map((m) => "  ✗ " + m).join("\n")); process.exit(1); }
console.log("\n[check-goal-4 PASS]");
