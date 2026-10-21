// The temperature profile of one world, every row, at a few moments: to see the mixed layer, the thermocline and the
// bottom mixed layer form (and to catch artefacts such as stairs or inversions).
//
//   node tools/layers.mjs [seed=2] [minutes=180] [every=45]

import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sim = new Function(html.slice(html.indexOf('// ===== PARAMS ====='), html.indexOf('// ===== Audio =====')) + '\nreturn { PARAMS, createWorld, stepWorld };')();
const [seed = 2, minutes = 180, every = 45] = process.argv.slice(2).map(Number);
const w = sim.createWorld(seed), { cols } = sim.PARAMS.grid, water = Math.ceil((sim.PARAMS.world.h - sim.PARAMS.world.floor) / (sim.PARAMS.world.h / sim.PARAMS.grid.rows));
for (let m = 1; m <= minutes; m++) {
  for (let t = 0; t < 60 * sim.PARAMS.time.tickRate; t++) { sim.stepWorld(w); w.music.notes.length = 0; }
  if (m % every) continue;
  const T = [];
  for (let j = 0; j < water; j++) { let s = 0; for (let i = 0; i < cols; i++) s += w.fields.temp[j * cols + i]; T.push(s / cols); }
  console.log(`min ${m} wind ${w.wind.toFixed(2)}: ` + T.map((x) => x.toFixed(1)).join(' '));
}
