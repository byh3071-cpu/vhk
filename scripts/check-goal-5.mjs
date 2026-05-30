#!/usr/bin/env node
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
const root = process.cwd();
const ok = [], fail = [];
const read = (p) => existsSync(join(root, p)) ? readFileSync(join(root, p), "utf8") : null;
const must = (c, m) => (c ? ok : fail).push(m);
function grepRepo(re) {
  const stack = [join(root, "src"), join(root, "tests")];
  while (stack.length) {
    const d = stack.pop();
    if (!existsSync(d)) continue;
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) stack.push(p);
      else if (/\.(ts|mjs|md)$/.test(e) && re.test(readFileSync(p, "utf8"))) return true;
    }
  }
  return false;
}
for (const id of [0, 1, 2, 3, 4]) {
  const s = "scripts/check-goal-" + id + ".mjs";
  if (!existsSync(join(root, s))) { fail.push(s + " 없음"); continue; }
  try { execSync("node " + s, { cwd: root, stdio: "pipe" }); ok.push("check-goal-" + id + " 통과"); }
  catch { fail.push("check-goal-" + id + " 실패"); }
}
must(existsSync(join(root, "src/commands/start.ts")), "vhk start 커맨드");
const status = read("src/commands/status.ts") || "";
must(/도움말|help/i.test(status + (read("src/lib/nlp-router.ts") || "")), "자연어 도움말 라우팅");
// R1 가드: 주석 문구 grep 이 아니라 실제 가드 코드 구조를 검증(가드 삭제 시 게이트 실패).
const cliArgsSrc = read("src/lib/cli-args.ts") || "";
must(
  /function isRealSubcommandPath/.test(cliArgsSrc) &&
    /isRealSubcommandPath\(/.test(cliArgsSrc.replace(/function isRealSubcommandPath/, "")) &&
    /COMMAND_SUBCOMMANDS/.test(cliArgsSrc),
  "R1 라우터 명령어 가드(isRealSubcommandPath 정의+호출+레지스트리)"
);
must(/diff/.test(status), "status diff 우선");
must(/AGENTS\.md/.test(read("src/commands/sync.ts") || ""), "AGENTS.md sync 타겟");
must(/dist\/index\.js|fallback|resolve/i.test(read("src/mcp/index.ts") || ""), "MCP PATH fallback");
console.log(ok.map((m) => "  ✓ " + m).join("\n"));
if (fail.length) { console.error("\n[check-goal-5 FAIL]\n" + fail.map((m) => "  ✗ " + m).join("\n")); process.exit(1); }
console.log("\n[check-goal-5 PASS]");
