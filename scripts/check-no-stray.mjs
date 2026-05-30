#!/usr/bin/env node
// 머지 게이트 — src/·tests/ 에 추적 안 된(untracked) 무관 파일이 없는지 검사.
// (리뷰/에이전트가 Bash 로 만든 PoC stray 파일이 소스 트리에 남는 것을 방지.)
// .cursor/·.vhk/·dist/ 등 루트/로컬 전용은 대상 아님 — 소스 트리(src/·tests/)만.
import { execFileSync } from "node:child_process";

let out = "";
try {
  out = execFileSync("git", ["status", "--porcelain"], { cwd: process.cwd(), encoding: "utf8" });
} catch {
  console.log("[check-no-stray] git 저장소 아님 — 검사 생략");
  process.exit(0);
}

const stray = out
  .split(/\r?\n/)
  .filter((l) => l.startsWith("?? "))
  .map((l) => l.slice(3).trim())
  .filter((p) => /^(src|tests)\//.test(p));

if (stray.length) {
  console.error("[check-no-stray FAIL] src/·tests/ 에 추적 안 된 무관 파일 발견 — 커밋 또는 삭제 필요:");
  for (const p of stray) console.error("  ?? " + p);
  console.error("(의도된 새 파일이면 git add, 리뷰 에이전트 stray 면 삭제)");
  process.exit(1);
}
console.log("[check-no-stray PASS] src/·tests/ untracked 무관 파일 0개");
