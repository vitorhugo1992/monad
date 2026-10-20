// Headless check of MONAD's simulation (no browser needed).
// Loads the PARAMS..Rules sections straight out of index.html and fast-forwards many seeds.
//
//   node tools/sim-check.mjs [seeds=30] [minutes=30] [firstSeed=1] [param.path=value ...]
//
// Reports per seed: population sparkline, min/max, cap pressure, extinctions, the bloom arc,
// diel migration, nutrient pulses, deaths by cause, nutrient conservation, phase sync and chains.
// Run with phase.K=0 to see that the sync comes from rule 6.

import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('// ===== PARAMS =====');
const end = html.indexOf('// ===== Harmony =====');
if (start < 0 || end < 0) throw new Error('section markers not found');
const sim = new Function(html.slice(start, end) +
  '\nreturn { PARAMS, createWorld, stepWorld, aliveCount, nutrientInventory, worldChecksum, dayPhase, syncStats, GENES, HUE_WHEEL };')();

// Positional numbers, plus PARAMS overrides like metabolism.efficiency=0.2 or diel.dayLength=600
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

// Bloom arc: a rise to >= 2x the running trough, a fall to <= half that peak (die-off),
// then a regrowth to >= 1.5x the new trough (recovery). Counts complete arcs.
function arcs(pops) {
  let state = 0, lo = Infinity, peak = 0, n = 0, dieoffs = 0;
  for (const p of pops) {
    if (state === 0) { lo = Math.min(lo, p); if (p >= 2 * lo + 10) { state = 1; peak = p; } }
    else if (state === 1) { peak = Math.max(peak, p); if (p <= 0.5 * peak) { state = 2; lo = p; dieoffs++; } }
    else { lo = Math.min(lo, p); if (p >= 1.5 * lo + 5) { n++; state = 1; peak = p; } }
  }
  return { n, dieoffs, bloom: state > 0 || n > 0 };
}

function run(seed) {
  const w = sim.createWorld(seed);
  const pops = [];
  let capTicks = 0, extinct = false, minPop = Infinity, maxPop = 0, pulses = 0, lastPhase = sim.dayPhase(w);
  const noon = [], night = [], syncs = [];
  const total = minutes * 60 * rate;
  for (let t = 1; t <= total; t++) {
    const before = w.pulses.length;
    sim.stepWorld(w);
    if (w.pulses.length > before) pulses++;
    const pop = sim.aliveCount(w);
    if (pop >= cap) capTicks++;
    if (pop === 0 && w.cysts.length === 0) extinct = true;
    if (t % sampleTicks === 0) {
      pops.push(pop);
      minPop = Math.min(minPop, pop); maxPop = Math.max(maxPop, pop);
      if (pop >= 20 && t % (3 * sampleTicks) === 0) syncs.push(sim.syncStats(w));
    }
    // Mean depth at mid-day and late night: diel vertical migration
    const ph = sim.dayPhase(w), D = sim.PARAMS.diel;
    const at = (x) => lastPhase < x && ph >= x;
    if ((at(D.dayFrac * 0.5) || at(0.95)) && pop > 0) {
      let y = 0;
      for (const c of w.cells) if (!c.dying) y += c.y;
      (at(0.95) ? night : noon).push(y / pop / 320);
    }
    lastPhase = ph;
  }
  const drift = sim.nutrientInventory(w) - (w.initialInventory + w.upwelled - w.carried);
  const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
  const alive = w.cells.filter((c) => !c.dying);
  const ramps = new Array(sim.HUE_WHEEL.length).fill(0);
  for (const c of alive) ramps[Math.floor(c.g.hue)]++;
  return {
    seed, pops, minPop, maxPop, capFrac: capTicks / total, extinct, drift, arc: arcs(pops), pulses,
    noon: mean(noon), night: mean(night), deaths: w.deaths, ramps,
    size: mean(alive.map((c) => c.g.size)), checksum: sim.worldChecksum(w),
    sync: Object.fromEntries(['local', 'locked', 'global', 'chained', 'chains', 'longest', 'coils', 'stars'].map((k) => [k, mean(syncs.map((q) => q[k]))])),
    longest: Math.max(1, ...syncs.map((q) => q.longest)),
  };
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
  const f = (v) => v.toFixed(2), d = r.deaths, dt = d.starved + d.old + d.grazed + d.sardines + d.salps || 1;
  process.stdout.write(
    `seed ${String(s).padStart(4)} |${spark(r.pops)}| min ${String(r.minPop).padStart(3)} max ${String(r.maxPop).padStart(3)}` +
    ` cap ${(r.capFrac * 100).toFixed(1).padStart(4)}% ${r.extinct ? 'EXTINCT' : '       '} arcs ${r.arc.n} falls ${r.arc.dieoffs}` +
    ` | depth noon ${f(r.noon)} night ${f(r.night)} | pulses ${r.pulses}` +
    ` | deaths S/O/G/F/Sp ${[d.starved, d.old, d.grazed, d.sardines, d.salps].map((x) => Math.round(100 * x / dt)).join('/')}%` +
    ` | size ${f(r.size)} ramps ${r.ramps.join('/')} drift ${r.drift.toExponential(1)}` +
    ` | sync loc ${f(r.sync.local)} lock ${f(r.sync.locked)} glob ${f(r.sync.global)}` +
    ` | chains ${r.sync.chains.toFixed(1)} in ${Math.round(r.sync.chained * 100)}% max ${r.longest} rings ${r.sync.coils.toFixed(1)} stars ${r.sync.stars.toFixed(1)}\n`);
}

const again = run(firstSeed);
const n = results.length;
console.log('\n' + [
  `seeds ${n}, ${minutes} min each, day ${sim.PARAMS.diel.dayLength} s, ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  `extinctions:        ${results.filter((r) => r.extinct).length}`,
  `hit cap >1% ticks:  ${results.filter((r) => r.capFrac > 0.01).length}`,
  `bloom+die-off+recovery: ${results.filter((r) => r.arc.n > 0).length}/${n}`,
  `migration (night - noon depth, median): ${median(results.map((r) => r.night - r.noon)).toFixed(2)} of the column`,
  `median min/max pop: ${median(results.map((r) => r.minPop))} / ${median(results.map((r) => r.maxPop))}`,
  `sync local / locked / global (median): ${['local', 'locked', 'global'].map((k) => median(results.map((r) => r.sync[k])).toFixed(2)).join(' / ')}`,
  `chains: median count ${median(results.map((r) => r.sync.chains)).toFixed(1)}, cells chained ${Math.round(100 * median(results.map((r) => r.sync.chained)))}%, longest ${Math.max(...results.map((r) => r.longest))}`,
  `max |nutrient drift|: ${Math.max(...results.map((r) => Math.abs(r.drift))).toExponential(2)}`,
  `deterministic rerun: ${again.checksum === results[0].checksum ? 'yes' : 'NO'} (${results[0].checksum.toString(16)})`,
].join('\n'));

function median(a) { const s = [...a].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; }
