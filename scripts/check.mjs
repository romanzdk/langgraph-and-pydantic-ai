// Checks every lesson: structure, quiz answers, line links, stepper traces, and that every code
// snippet is copied word for word from a runnable file in examples/ (a line "..." skips code).
// Usage: node scripts/check.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="((?:lib|traces|lessons\/)[^"]*\.js)"/g)].map((m) => m[1]);
const ctx = vm.createContext({});
vm.runInContext('globalThis.window = globalThis;', ctx);
for (const s of scripts) vm.runInContext(fs.readFileSync(path.join(root, s), 'utf8'), ctx, { filename: s });

const sources = fs
  .readdirSync(path.join(root, 'examples'))
  .filter((f) => f.endsWith('.py'))
  .map((f) => fs.readFileSync(path.join(root, 'examples', f), 'utf8'));
const CODE_PANES = ['lg', 'pa', 'cb', 'py'];
const PANES = [...CODE_PANES, 'sh'];
const errors = [];
const ids = new Set();

for (const lesson of ctx.LESSONS) {
  const where = (s) => `${lesson.id}: ${s}`;
  for (const key of ['id', 'title', 'summary', 'intro', 'examples']) if (!lesson[key]) errors.push(where(`missing ${key}`));
  if (ids.has(lesson.id)) errors.push(where('duplicate id'));
  ids.add(lesson.id);

  lesson.examples.forEach((ex, ei) => {
    const kinds = PANES.filter((k) => ex[k] !== undefined);
    if (!kinds.length) errors.push(where(`example ${ei} has no code`));
    for (const k of kinds.filter((k) => CODE_PANES.includes(k))) {
      const chunks = ex[k].split(/^\.\.\.$/m).map((c) => c.replace(/^\n+|\n+$/g, ''));
      for (const chunk of chunks) {
        // The code tag removes the common indent, so a snippet from inside a function may be shifted left.
        const indented = [0, 4, 8, 12, 16].map((n) => chunk.replace(/^(?=.)/gm, ' '.repeat(n)));
        if (!sources.some((src) => indented.some((c) => src.includes(c)))) {
          errors.push(where(`example "${ex.title}" ${k}: snippet not found in examples/:\n${chunk}`));
        }
      }
    }
    // A line shows the note of the last link that marks it, so every link needs a line of its own.
    const owner = kinds.map(() => ({}));
    (ex.links || []).forEach((link, li) => kinds.forEach((_, pi) => link[pi] && (owner[pi][link[pi]] = li)));
    (ex.links || []).forEach((link, li) => {
      if (!kinds.some((_, pi) => owner[pi][link[pi]] === li)) errors.push(where(`example "${ex.title}": link ${li + 1} is hidden by a later link on the same lines`));
    });
    for (const link of ex.links || []) {
      if (link.length !== kinds.length + 1) errors.push(where(`example "${ex.title}": link ${JSON.stringify(link)} needs ${kinds.length} line numbers and a note`));
      kinds.forEach((k, pi) => {
        const n = link[pi];
        if (n === null) return;
        const lines = ex[k].split('\n');
        if (!Number.isInteger(n) || n < 1 || n > lines.length || !lines[n - 1].trim() || lines[n - 1] === '...') {
          errors.push(where(`example "${ex.title}": ${k} line ${n} is out of range or empty`));
        }
      });
    }
  });

  (lesson.quiz || []).forEach((q, qi) => {
    if (!(q.answer >= 0 && q.answer < q.options.length)) errors.push(where(`quiz ${qi + 1}: answer out of range`));
    if (!q.why) errors.push(where(`quiz ${qi + 1}: missing why`));
  });

  if (lesson.stepper) {
    const runs = ctx.TRACES[lesson.stepper.trace];
    if (!runs) errors.push(where(`stepper: unknown trace ${lesson.stepper.trace}`));
    else for (const r of lesson.stepper.runs || []) if (!runs[r]) errors.push(where(`stepper: no run ${r}`));
  }
}

if (errors.length) {
  console.error(errors.join('\n\n'));
  console.error(`\n${errors.length} problem(s)`);
  process.exit(1);
}
console.log(`ok: ${ctx.LESSONS.length} lessons checked`);
