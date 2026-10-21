// How many times real time the simulation runs, and with how many cells (speed depends mostly on the cell count,
// so compare like with like). Lets the world grow 10 minutes first, then times the given minutes.
//
//   node tools/bench.mjs [seed=1] [minutes=10] [file=index.html]
//
// Pass another copy of the page as file to compare versions (e.g. `git show HEAD~1:index.html > old.html`).
// For a profile: node --cpu-prof --cpu-prof-dir=prof tools/bench.mjs 3 10, then node tools/cpu-top.mjs prof

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const [seed = 1, minutes = 10] = process.argv.slice(2, 4).map(Number), file = process.argv[4];
const html = readFileSync(file ? resolve(file) : new URL('../index.html', import.meta.url), 'utf8');
const sim = new Function(html.slice(html.indexOf('// ===== PARAMS ====='), html.indexOf('// ===== Audio =====')) + '\nreturn { createWorld, stepWorld };')();
const w = sim.createWorld(seed), n = minutes * 60 * 30;
for (let t = 0; t < 600 * 30; t++) { sim.stepWorld(w); w.music.notes.length = 0; }   // grow first
let cells = 0;
const t0 = performance.now();
for (let t = 0; t < n; t++) { sim.stepWorld(w); w.music.notes.length = 0; if (t % 300 === 0) cells += w.cells.length; }
console.log(`${(minutes * 60 / ((performance.now() - t0) / 1000)).toFixed(0)}x real time (mean ${(cells / (n / 300)).toFixed(0)} cells)`);
