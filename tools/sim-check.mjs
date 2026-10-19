// Headless check of MONAD's simulation (no browser needed).
// Loads the PARAMS..Rules sections straight out of index.html and fast-forwards many seeds.
//
//   node tools/sim-check.mjs [seeds=30] [minutes=30] [firstSeed=1]
//
// Reports per seed: population sparkline, min/max, cap pressure, extinctions,
// whether the first 10 minutes contain a rise, a fall and a recovery, and nutrient conservation.

import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('// ===== PARAMS =====');
const end = html.indexOf('// ===== Harmony =====');
if (start < 0 || end < 0) throw new Error('section markers not found');
const sim = new Function(html.slice(start, end) +
  '\nreturn { PARAMS, createWorld, stepWorld, aliveCount, nutrientInventory, worldChecksum, GENES };')();

// Positional numbers, plus PARAMS overrides like metabolism.efficiency=0.2
const args = process.argv.slice(2);
for (const a of args.filter((s) => s.includes('='))) {
  const [path, value] = a.split('='), keys = path.split('.');
  let o = sim.PARAMS;
  for (const k of keys.slice(0, -1)) o = o[k];
  o[keys.at(-1)] = Number(value);
}
const [seeds = 30, minutes = 30, firstSeed = 1] = args.filter((s) => !s.includes('=')).map(Number);
const rate = sim.PARAMS.time.tickRate, cap = sim.PARAMS.division.maxCells;
const sampleTicks = 10 * rate;               // one sample every 10 s
const BARS = ' .:-=+*#%@';

function run(seed) {
  const w = sim.createWorld(seed);
  const pops = [], cysts = [];
  let capTicks = 0, extinct = false, minPop = Infinity, maxPop = 0;
  const total = minutes * 60 * rate;
  for (let t = 1; t <= total; t++) {
    sim.stepWorld(w);
    const pop = sim.aliveCount(w);
    if (pop >= cap) capTicks++;
    if (pop === 0 && w.cysts.length === 0) extinct = true;
    if (t % sampleTicks === 0) {
      pops.push(pop); cysts.push(w.cysts.length);
      minPop = Math.min(minPop, pop); maxPop = Math.max(maxPop, pop);
    }
  }
  const drift = sim.nutrientInventory(w) - (w.initialInventory + w.upwelled);

  // Within the first 10 minutes: a peak followed by a fall of >= 30% ("fall"),
  // and anywhere in the run a trough followed by a regrowth of >= 20% ("recover").
  const first = pops.slice(0, 60);
  const peak = Math.max(...first), tp = first.indexOf(peak);
  const fall = Math.min(...first.slice(tp)) <= peak * 0.7;
  let recover = false, trough = Infinity;
  for (let i = tp; i < pops.length && !recover; i++) {
    trough = Math.min(trough, pops[i]);
    if (trough <= peak * 0.7 && pops[i] >= trough * 1.2 + 2) recover = true;
  }
  const arc = (fall ? 'F' : '-') + (recover ? 'R' : '-');

  const genes = {};
  const alive = w.cells.filter((c) => !c.dying);
  for (const k of Object.keys(sim.GENES)) genes[k] = alive.length ? alive.reduce((s, c) => s + c.g[k], 0) / alive.length : NaN;
  const ramps = [0, 0, 0, 0];
  for (const c of alive) ramps[Math.floor(c.g.hue)]++;
  // Mean size above and below the population's median depth: the light/nutrient niche split
  const ys = alive.map((c) => c.y).sort((p, q) => p - q), mid = ys[Math.floor(ys.length / 2)];
  const meanSize = (cs) => (cs.length ? cs.reduce((s, c) => s + c.g.size, 0) / cs.length : NaN);
  genes.sizeUp = meanSize(alive.filter((c) => c.y < mid));
  genes.sizeDown = meanSize(alive.filter((c) => c.y >= mid));
  return { seed, pops, cysts, minPop, maxPop, capFrac: capTicks / total, extinct, drift, arc, genes, ramps, checksum: sim.worldChecksum(w) };
}

function spark(values) {
  const step = Math.max(1, Math.floor(values.length / 60));
  let s = '';
  for (let i = 0; i < values.length; i += step) s += BARS[Math.min(BARS.length - 1, Math.floor(values[i] / cap * BARS.length))];
  return s;
}

const t0 = Date.now();
const results = [];
for (let s = firstSeed; s < firstSeed + seeds; s++) {
  const r = run(s);
  results.push(r);
  const f = (v) => v.toFixed(2);
  process.stdout.write(
    `seed ${String(s).padStart(4)} |${spark(r.pops)}| min ${String(r.minPop).padStart(3)} max ${String(r.maxPop).padStart(3)}` +
    ` cap ${(r.capFrac * 100).toFixed(1).padStart(4)}% ${r.extinct ? 'EXTINCT' : '       '} arc ${r.arc}` +
    ` drift ${r.drift.toExponential(1)} | size ${f(r.genes.sizeUp)}/${f(r.genes.sizeDown)} depth ${f(r.genes.depthPref)} ramps ${r.ramps.join('/')}\n`);
}

const again = run(firstSeed);
const n = results.length;
console.log('\n' + [
  `seeds ${n}, ${minutes} min each, ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  `extinctions:        ${results.filter((r) => r.extinct).length}`,
  `hit cap >1% ticks:  ${results.filter((r) => r.capFrac > 0.01).length}`,
  `fall in first 10 min: ${results.filter((r) => r.arc[0] === "F").length}/${n}, recovered: ${results.filter((r) => r.arc[1] === "R").length}/${n}`,
  `median min/max pop: ${median(results.map((r) => r.minPop))} / ${median(results.map((r) => r.maxPop))}`,
  `max |nutrient drift|: ${Math.max(...results.map((r) => Math.abs(r.drift))).toExponential(2)}`,
  `deterministic rerun: ${again.checksum === results[0].checksum ? 'yes' : 'NO'} (${results[0].checksum.toString(16)})`,
].join('\n'));

function median(a) { const s = [...a].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; }
