#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
const root = process.cwd();
const ok = [], fail = [];
const read = (p) => existsSync(join(root, p)) ? readFileSync(join(root, p), "utf8") : null;
const must = (c, m) => (c ? ok : fail).push(m);
const init = read("src/commands/init.ts");
must(init && /RULES\.md/.test(init), "init.ts 가 RULES.md 생성에 관여");
must(existsSync(join(root, "src/lib/rules-import.ts")), "rules-import.ts 존재(adopt)");
const sync = read("src/commands/sync.ts");
must(sync && /SYNC_TARGETS/.test(sync), "sync.ts SYNC_TARGETS");
must(sync && /copilot/i.test(sync), "copilot 타겟");
must(sync && /windsurf/i.test(sync), "windsurf 타겟");
const readme = read("README.md");
must(readme && /(Cursor|Copilot|Antigravity)/.test(readme), "README 채팅 가이드");
console.log(ok.map((m) => "  ✓ " + m).join("\n"));
if (fail.length) { console.error("\n[check-goal-3 FAIL]\n" + fail.map((m) => "  ✗ " + m).join("\n")); process.exit(1); }
console.log("\n[check-goal-3 PASS]");
