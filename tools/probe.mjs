// A time series of one world's water, for tuning (no browser needed).
// Loads the PARAMS..Rules sections of index.html like sim-check, applying PARAMS overrides BEFORE the code runs, so
// constants derived from PARAMS at load time see them too.
//
//   node tools/probe.mjs [seed=1] [minutes=60] [param.path=value ...]
//
// Prints every minute (every 5 for runs over 2 h): wind, surface / mid-column / bottom temperature, bottom-water
// oxygen (mean and lowest node), filamentous cyanobacteria (total and in the surface row: the scum), marine snow and
// the floor deposit, living cells, the small cyanobacteria, RAIN while runoff spreads; then the deaths by cause,
// nitrogen fixed, nutrients washed in, the speed, and the oxygen and temperature profile at the end.

import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const src = html.slice(html.indexOf('// ===== PARAMS ====='), html.indexOf('// ===== Audio ====='));
const args = process.argv.slice(2), over = args.filter((a) => a.includes('='));
const patch = over.map((a) => { const [p, v] = a.split('='); return `PARAMS.${p} = ${v};`; }).join('\n');
const sim = new Function(src.replace('// ===== RNG =====', patch + '\n// ===== RNG =====') +
  '\nreturn { PARAMS, createWorld, stepWorld, aliveCount, cyanoTotal, bottomOxygen, surfaceTemp };')();
const [seed = 1, minutes = 60] = args.filter((a) => !a.includes('=')).map(Number);
const w = sim.createWorld(seed), rate = sim.PARAMS.time.tickRate, { cols, rows } = sim.PARAMS.grid;
const t0 = Date.now();
let ticks = 0;
console.log('min  wind  Tsurf Tmid  Tbot | O2bot  min  | fil  scum | snow  deposit | cells cyano  runoff');
for (let m = 1; m <= minutes; m++) {
  for (let t = 0; t < 60 * rate; t++) { sim.stepWorld(w); w.music.notes.length = 0; ticks++; }
  if (m % (minutes > 120 ? 5 : 1)) continue;
  const f = w.fields, ox = sim.bottomOxygen(w), cy = sim.cyanoTotal(w), mid = rows >> 1;
  let scum = 0, det = 0, sed = 0, tm = 0, tb = 0;
  for (let i = 0; i < cols; i++) { scum += f.tri[i]; sed += f.sed[i]; tm += f.temp[mid * cols + i]; tb += f.temp[(rows - 4) * cols + i]; }
  for (let k = 0; k < f.det.length; k++) det += f.det[k];
  console.log(`${String(m).padStart(3)}  ${w.wind.toFixed(2)}  ${sim.surfaceTemp(w).toFixed(1)}  ${(tm / cols).toFixed(1)}  ${(tb / cols).toFixed(1)} | ${ox.mean.toFixed(2)}  ${ox.min.toFixed(2)} | ${cy.tri.toFixed(1).padStart(5)} ${(scum / cols).toFixed(2)} | ${det.toFixed(1).padStart(5)} ${sed.toFixed(1).padStart(6)} | ${String(sim.aliveCount(w)).padStart(4)} ${(cy.syn + cy.pro).toFixed(0).padStart(4)}  ${w.runoffs.length ? 'RAIN' : ''}`);
}
console.log(`deaths ${JSON.stringify(w.deaths)}, fixed ${w.fixed.toFixed(1)}, washed in ${w.washed.toFixed(1)}; ${(ticks / ((Date.now() - t0) / 1000) / rate).toFixed(0)}x real time`);
for (let j = 0; j < rows; j += 3) {   // the column at the end, every third row
  let o = 0, lo = Infinity, t = 0;
  for (let i = 0; i < cols; i++) { const v = w.fields.o2[j * cols + i]; o += v; lo = Math.min(lo, v); t += w.fields.temp[j * cols + i]; }
  console.log(`row ${String(j).padStart(2)}  O2 ${(o / cols).toFixed(2)} (lowest ${lo.toFixed(2)})  T ${(t / cols).toFixed(1)}`);
}
