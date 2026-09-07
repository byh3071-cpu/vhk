// Managed instruction checker; update the source and distribute the reviewed copy.
// Dependency-free, read-only checks. No network requests or autofix.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function digest(text) {
  return createHash('sha256').update(text.replace(/\r\n/g, '\n').trim()).digest('hex');
}
export function checkInstructions(root, config, inventory) {
  const errors = [];
  const exists = relative => inventory ? inventory.has(relative) : fs.existsSync(path.join(root, relative));
  const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
  const fail = (file, reason) => errors.push(`${file}: ${reason}`);
  for (const file of config.roster_files ?? []) {
    if (!exists(file)) { fail(file, 'required roster file missing'); continue; }
    const content = read(file);
    const blocks = [...content.matchAll(/<!-- YOHAN-ROSTER-CARD:BEGIN[^>]*-->\s*([\s\S]*?)\s*<!-- YOHAN-ROSTER-CARD:END -->/g)];
    if (blocks.length !== 1 || (content.match(/YOHAN-ROSTER-CARD:BEGIN/g) ?? []).length !== 1 || (content.match(/YOHAN-ROSTER-CARD:END/g) ?? []).length !== 1) {
      fail(file, 'expected exactly one complete roster block');
    } else if (digest(blocks[0][1]) !== config.roster_sha256) fail(file, 'roster differs from the reviewed source card');
    if (file.endsWith('.mdc')) {
      if (!/^---\r?\ndescription: [^\n]+\r?\nalwaysApply: true\r?\n---\r?\n/.test(content)) fail(file, 'invalid Cursor frontmatter');
      if ((content.match(/^---\s*$/gm) ?? []).length !== 2) fail(file, 'duplicate Cursor frontmatter');
    }
  }
  if (exists('RULES.md') && read('RULES.md').includes('YOHAN-ROSTER-CARD:BEGIN')) fail('RULES.md', 'derived roster must not be copied into the source');
  if (config.ecosystem_sha256) {
    const file = '.cursor/rules/ecosystem.mdc';
    if (!exists(file)) fail(file, 'ecosystem template missing');
    else {
      const blocks = [...read(file).matchAll(/<!-- ECOSYSTEM-MDC:START[^>]*-->[\s\S]*?<!-- ECOSYSTEM-MDC:END -->/g)];
      if (blocks.length !== 1 || digest(blocks[0][0]) !== config.ecosystem_sha256) fail(file, 'ecosystem template drift');
    }
  }
  if (exists('CLAUDE.md')) {
    // Inspect live status lines only; examples and historical TODO lists are not completion claims.
    for (const line of read('CLAUDE.md').split(/\r?\n/)) {
      if (/^\s*[-*]\s.*(?:Phase|다음 액션|블로커)/.test(line) && /\bFILL\b/.test(line)) fail('CLAUDE.md', 'unresolved live status placeholder');
    }
  }
  for (const file of config.link_files ?? []) {
    if (!exists(file)) { fail(file, 'required entrypoint missing'); continue; }
    const content = read(file);
    for (const match of content.matchAll(/\[[^\]\n]+\]\(([^\s)]+)\)/g)) {
      const target = match[1].split('#')[0];
      if (!target || /^(?:[a-z]+:|\/)/i.test(target)) continue;
      let relative;
      try { relative = path.posix.normalize(path.posix.join(path.posix.dirname(file), decodeURIComponent(target))); }
      catch { fail(file, 'invalid link encoding'); continue; }
      if (relative.startsWith('../') || !exists(relative)) fail(file, `broken relative link: ${target}`);
    }
  }
  if (config.state_entrypoint) {
    const file = 'docs/state/next-task.md';
    if (!exists(file)) fail(file, 'state entrypoint missing');
    else if (/^\s*(?:TASK: Goal|status:\s*(?:IN_PROGRESS|NOT_STARTED|DONE))/m.test(read(file))) {
      fail(file, 'current state is copied into an entrypoint; refer to the Goal source');
    }
  }
  return errors;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = path.resolve(process.argv[2] ?? '.');
  const config = JSON.parse(fs.readFileSync(path.join(root, '.github/instruction-drift.json'), 'utf8'));
  let inventory;
  if (process.argv[3]) inventory = new Set(JSON.parse(fs.readFileSync(process.argv[3], 'utf8')));
  const errors = checkInstructions(root, config, inventory);
  for (const error of errors) console.error(error);
  console.log(`Instruction drift: ${errors.length} errors`);
  if (errors.length) process.exitCode = 1;
}
