// Headless check of MONAD's simulation (no browser needed).
// Loads the PARAMS..Rules sections straight out of index.html and fast-forwards many seeds.
//
//   node tools/sim-check.mjs [seeds=30] [minutes=30] [firstSeed=1] [param.path=value ...]
//
// Also checks that a world saved and restored twice on the way ends exactly where an unbroken run ends, and that
// every old saved world in tools/fixtures still loads and lives on in this version (an update must never break
// a kept world on opening).
//
//   node tools/sim-check.mjs --save-fixture     saves a real world from this version into tools/fixtures
//
// Reports per seed: population sparkline, min/max, cap pressure, extinctions, the bloom arc,
// diel migration, nutrient pulses, deaths by cause, nutrient conservation, phase sync and chains,
// and the music the voice budget lets through: onsets/s, silences, chords and how consonant it is.
// Run with phase.K=0 to see that the sync comes from rule 6.

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { serialize, deserialize } from 'node:v8';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('// ===== PARAMS =====');
const end = html.indexOf('// ===== Audio =====');
if (start < 0 || end < 0) throw new Error('section markers not found');
const sim = new Function(html.slice(start, end) +
  '\nreturn { PARAMS, createWorld, stepWorld, aliveCount, nutrientInventory, worldChecksum, dayPhase, syncStats, dinoWeight, GENES, HUE_WHEEL, intervalClass, keyName, snapshotWorld, restoreWorld, aliveCount: aliveCount, silicaInventory, meanSilica };')();

// Positional numbers, plus PARAMS overrides like metabolism.efficiency=0.2 or diel.dayLength=600
const args = process.argv.slice(2);
for (const a of args.filter((s) => s.includes('='))) {
  const [path, value] = a.split('='), keys = path.split('.');
  let o = sim.PARAMS;
  for (const k of keys.slice(0, -1)) o = o[k];
  o[keys.at(-1)] = Number(value);
}
const [seeds = 30, minutes = 30, firstSeed = 1] = args.filter((s) => !s.includes('=') && !s.startsWith('--')).map(Number);
const FIXTURES = new URL('./fixtures/', import.meta.url), FIXTURE_MINUTES = 5;

// A fixture: a lived-in world (chains, elders, cysts, visitors in the water) saved as this version saves it, with
// the checksum it reached FIXTURE_MINUTES later, so a later version can tell whether its rules still grow the same world
if (args.includes('--save-fixture')) {
  const rate = sim.PARAMS.time.tickRate;
  const rich = (w) => w.visitors.length && w.cysts.length && w.cells.some((c) => c.chainLen > 1) && w.cells.some((c) => c.elder >= 1);
  let w;
  for (let seed = 1; seed <= 20; seed++) {
    w = sim.createWorld(seed);
    for (let t = 0; t < 3600 * rate && !(t > 1200 * rate && rich(w)); t++) { sim.stepWorld(w); w.music.notes.length = 0; }
    if (rich(w)) break;
  }
  const snap = sim.snapshotWorld(w), after = sim.restoreWorld(structuredClone(snap));
  for (let t = 0; t < FIXTURE_MINUTES * 60 * rate; t++) { sim.stepWorld(after); after.music.notes.length = 0; }
  const name = `world-v${snap.v}.bin`;
  mkdirSync(FIXTURES, { recursive: true });
  writeFileSync(new URL(name, FIXTURES), serialize({ snap, minutes: FIXTURE_MINUTES, checksum: sim.worldChecksum(after), savedAt: new Date().toISOString() }));
  console.log(`saved tools/fixtures/${name}: seed ${w.seed}, tick ${w.tick}, ${sim.aliveCount(w)} cells, ${w.cysts.length} cysts, visitors ${w.visitors.map((v) => v.kind).join(',')}`);
  process.exit(0);
}
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

const GROUPS = ['glass', 'dino', 'green', 'cocco', 'crypto'];
const GROUP_NAMES = ['diatoms', 'dinoflagellates', 'green algae', 'coccolithophores', 'cryptophytes'];
const GROUP_OF = ['green', 'dino', 'dino', 'dino', 'dino', 'glass', 'glass', 'cocco', 'crypto'];   // by kind

function run(seed) {
  const w = sim.createWorld(seed);
  const pops = [];
  let lateMin = Infinity, lateCellMin = Infinity, extinctAt = null;
  let capTicks = 0, extinct = false, minPop = Infinity, maxPop = 0, pulses = 0, lastPhase = sim.dayPhase(w);
  const noon = [], night = [], syncs = [], dinos = [], groups = [];
  // Music: onset times, chords (2+ onsets within chordWin), clashes against the notes still sounding
  const chordWin = 0.3 * rate, sounding = [], onsetTicks = [];
  let chords2 = 0, chords3 = 0, group = 0, groupStart = -1e9, pairs = 0, harsh = 0, seconds = 0, lastNotes = 0, maxVox = 0;
  const total = minutes * 60 * rate;
  for (let t = 1; t <= total; t++) {
    const before = w.pulses.length;
    sim.stepWorld(w);
    if (w.pulses.length > before) pulses++;
    for (let i = sounding.length - 1; i >= 0; i--) if (sounding[i].end <= t) sounding.splice(i, 1);
    for (const n of w.music.notes) {
      onsetTicks.push(t);
      if (n.last) lastNotes++;
      if (t - groupStart > chordWin) { if (group >= 2) chords2++; if (group >= 3) chords3++; group = 0; groupStart = t; }
      group++;
      for (const o of sounding) { const ic = sim.intervalClass(n.pc, o.pc); pairs++; if (ic === 1 || ic === 6) harsh++; if (ic === 2) seconds++; }
      sounding.push({ pc: n.pc, end: t + Math.ceil((n.attack + n.release) * rate) });
    }
    w.music.notes.length = 0;
    maxVox = Math.max(maxVox, w.music.ends.length);
    const pop = sim.aliveCount(w);
    if (pop >= cap) capTicks++;
    if (pop === 0 && w.cysts.length === 0 && !extinct) { extinct = true; extinctAt = t / rate / 60; }
    if (t % sampleTicks === 0) {
      pops.push(pop);
      minPop = Math.min(minPop, pop); maxPop = Math.max(maxPop, pop);
      if (t > 600 * rate) { lateMin = Math.min(lateMin, pop + w.cysts.length); lateCellMin = Math.min(lateCellMin, pop); }   // after the inoculum has grown
      if (pop >= 20 && t % (3 * sampleTicks) === 0) syncs.push(sim.syncStats(w));
      // Dinoflagellates: their share of the living cells, and how many there are (Margalef: blooms only in calm water)
      // Five groups by form: diatoms, dinoflagellates, green algae, coccolithophores, cryptophytes
      const gc = { glass: 0, dino: 0, green: 0, cocco: 0, crypto: 0 };
      for (const c of w.cells) if (!c.dying) gc[GROUP_OF[c.kind]]++;
      const nd = gc.dino;
      dinos.push({ n: nd, share: pop ? nd / pop : 0, wind: w.wind });
      // Diversity, late in the run; one group >= 90% counts as a monoculture
      if (t > total / 2 && pop >= 10) groups.push(Object.fromEntries(GROUPS.map((k) => [k, gc[k] / pop])));
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
  if (group >= 2) chords2++;
  if (group >= 3) chords3++;
  // Silences: gaps between onsets; near-silence = a gap of at least 6 s
  let longest = 0, quiet = 0, prev = 0;
  for (const o of [...onsetTicks, total]) { const g = (o - prev) / rate; longest = Math.max(longest, g); if (g >= 6) quiet += g; prev = o; }
  const music = { ons: onsetTicks.length / (total / rate), longest, quiet: quiet / (total / rate), chords2: chords2 / minutes, chords3: chords3 / minutes,
                  harsh: pairs ? harsh / pairs : 0, seconds: pairs ? seconds / pairs : 0, lastNotes, maxVox, key: sim.keyName(w.music) };
  const drift = sim.nutrientInventory(w) - (w.initialInventory + w.upwelled - w.carried + w.imported);
  const siDrift = sim.silicaInventory(w) - (w.initialSilica + w.siUpwelled);
  const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
  const alive = w.cells.filter((c) => !c.dying);
  const ramps = new Array(sim.HUE_WHEEL.length).fill(0);
  for (const c of alive) ramps[Math.floor(c.g.hue)]++;
  return {
    seed, music, pops, minPop, maxPop, lateMin, lateCellMin, extinctAt, capFrac: capTicks / total, extinct, drift, siDrift, arc: arcs(pops), pulses,
    noon: mean(noon), night: mean(night), deaths: w.deaths, ramps,
    size: mean(alive.map((c) => c.g.size)), checksum: sim.worldChecksum(w),
    sync: Object.fromEntries(['local', 'locked', 'global', 'chained', 'chains', 'longest', 'coils', 'stars'].map((k) => [k, mean(syncs.map((q) => q[k]))])),
    longest: Math.max(1, ...syncs.map((q) => q.longest)),
    dino: { share: mean(dinos.map((q) => q.share)), peak: Math.max(0, ...dinos.map((q) => q.n)),
            over50: dinos.filter((q) => q.n >= 50).length / (dinos.length || 1) },
    groups: { share: GROUPS.map((k) => mean(groups.map((q) => q[k]))),
              mono: groups.filter((q) => Math.max(...GROUPS.map((k) => q[k])) >= 0.9).length / (groups.length || 1),
              // who leads the water, and for what share of the time: a succession gives every group its turn
              lead: GROUPS.map((k) => groups.filter((q) => GROUPS.every((o) => q[k] >= q[o])).length / (groups.length || 1)) },
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
  const f = (v) => v.toFixed(2), d = r.deaths, dt = d.starved + d.old + d.grazed + d.sardines + d.salps + (d.hunted || 0) + (d.lysed || 0) || 1;
  process.stdout.write(
    `seed ${String(s).padStart(4)} |${spark(r.pops)}| min ${String(r.minPop).padStart(3)} max ${String(r.maxPop).padStart(3)}` +
    ` late min ${String(r.lateCellMin).padStart(3)} (+cysts ${String(r.lateMin).padStart(3)})` +
    ` cap ${(r.capFrac * 100).toFixed(1).padStart(4)}% ${r.extinct ? `EXTINCT at ${r.extinctAt.toFixed(0)} min` : '       '} arcs ${r.arc.n} falls ${r.arc.dieoffs}` +
    ` | depth noon ${f(r.noon)} night ${f(r.night)} | pulses ${r.pulses}` +
    ` | deaths S/O/G/F/Sp/H/V ${[d.starved, d.old, d.grazed, d.sardines, d.salps, d.hunted, d.lysed].map((x) => Math.round(100 * x / dt)).join('/')}%` +
    ` | size ${f(r.size)} ramps ${r.ramps.join('/')} drift ${r.drift.toExponential(1)}` +
    ` | sync loc ${f(r.sync.local)} lock ${f(r.sync.locked)} glob ${f(r.sync.global)}` +
    ` | chains ${r.sync.chains.toFixed(1)} in ${Math.round(r.sync.chained * 100)}% max ${r.longest} rings ${r.sync.coils.toFixed(1)} stars ${r.sync.stars.toFixed(1)}` +
    ` | dino ${Math.round(r.dino.share * 100)}% peak ${r.dino.peak} >=50 ${Math.round(r.dino.over50 * 100)}%` +
    ` | late diat/dino/green/cocco/crypto ${r.groups.share.map((x) => Math.round(x * 100)).join('/')}% mono ${Math.round(r.groups.mono * 100)}% lead ${r.groups.lead.map((x) => Math.round(x * 100)).join('/')}%` +
    ` | music ${r.music.key} ons ${r.music.ons.toFixed(2)}/s vox<=${r.music.maxVox} quiet ${Math.round(r.music.quiet * 100)}% longest ${r.music.longest.toFixed(0)} s` +
    ` chords/min ${r.music.chords2.toFixed(1)} (3+ ${r.music.chords3.toFixed(1)}) clash ${(r.music.harsh * 100).toFixed(1)}% 2nds ${(r.music.seconds * 100).toFixed(0)}% last ${r.music.lastNotes}\n`);
}

const again = run(firstSeed);

// Save and restore: a world saved, stored (structured clone, as IndexedDB does) and restored twice on the way
// must end exactly where an unbroken run ends, down to every field of every cell.
function roundTrip(seed) {
  const total = minutes * 60 * rate, cuts = [Math.floor(total / 3), Math.floor(2 * total / 3)];
  const step = (w) => { sim.stepWorld(w); w.music.notes.length = 0; };
  const a = sim.createWorld(seed);
  for (let t = 0; t < total; t++) step(a);
  let b = sim.createWorld(seed), saveMs = 0, bytes = 0;
  for (let t = 0; t < total; t++) {
    if (cuts.includes(t)) {
      const s0 = Date.now(), snap = structuredClone(sim.snapshotWorld(b));
      bytes = Math.max(bytes, serialize(snap).length);
      b = sim.restoreWorld(snap);
      saveMs = Math.max(saveMs, Date.now() - s0);
    }
    step(b);
  }
  return { same: isDeepStrictEqual(sim.snapshotWorld(a), sim.snapshotWorld(b)), sum: sim.worldChecksum(a) === sim.worldChecksum(b), saveMs, bytes };
}
const trip = roundTrip(firstSeed);
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
  `dinoflagellates: median share ${Math.round(100 * median(results.map((r) => r.dino.share)))}%, seeds with a bloom of >=50: ${results.filter((r) => r.dino.peak >= 50).length}/${n}, median time spent >=50: ${Math.round(100 * median(results.map((r) => r.dino.over50)))}%`,
  `music (median): onsets ${median(results.map((r) => r.music.ons)).toFixed(2)}/s, near-silence ${Math.round(100 * median(results.map((r) => r.music.quiet)))}% of the time, chords ${median(results.map((r) => r.music.chords2)).toFixed(1)}/min (3+ ${median(results.map((r) => r.music.chords3)).toFixed(1)}), m2/tritone clashes ${(100 * median(results.map((r) => r.music.harsh))).toFixed(1)}%, seconds ${Math.round(100 * median(results.map((r) => r.music.seconds)))}%`,
  `diversity, second half (median share): ${GROUP_NAMES.map((name, i) => name + ' ' + Math.round(100 * median(results.map((r) => r.groups.share[i] || 0))) + '%').join(', ')}; monoculture (one group >= 90%) ${Math.round(100 * median(results.map((r) => r.groups.mono)))}% of the time, worst seed ${Math.round(100 * Math.max(...results.map((r) => r.groups.mono)))}%`,
  `leading the water (mean share of time): ${GROUP_NAMES.map((name, i) => name + ' ' + Math.round(100 * results.reduce((s, r) => s + r.groups.lead[i], 0) / results.length) + '%').join(', ')}`,
  `causes of death (median share): ${['starved', 'old', 'grazed', 'sardines', 'salps', 'hunted', 'lysed'].map((k) => k + ' ' + Math.round(100 * median(results.map((r) => { const d = r.deaths, t = Object.values(d).reduce((s, v) => s + v, 0) || 1; return (d[k] || 0) / t; }))) + '%').join(', ')}`,
  `max |nutrient drift|: ${Math.max(...results.map((r) => Math.abs(r.drift))).toExponential(2)}, |silica drift|: ${Math.max(...results.map((r) => Math.abs(r.siDrift))).toExponential(2)}`,
  `deterministic rerun: ${again.checksum === results[0].checksum ? 'yes' : 'NO'} (${results[0].checksum.toString(16)})`,
  `save/restore round trip: ${trip.same && trip.sum ? 'identical' : 'DIFFERENT'} (snapshot ~${(trip.bytes / 1024).toFixed(0)} KB, save+restore ${trip.saveMs} ms)`,
].join('\n'));

// Every saved world from an earlier version must still load and live on: no crash, no NaN, the water's
// nutrients still finite. Whether it grows exactly the same world tells if the rules changed since (allowed).
let fixturesOk = true;
const fixtureLines = [];
for (const f of (() => { try { return readdirSync(FIXTURES).filter((n) => n.endsWith('.bin')).sort(); } catch (e) { return []; } })()) {
  try {
    const fx = deserialize(readFileSync(new URL(f, FIXTURES))), w = sim.restoreWorld(fx.snap), rate = sim.PARAMS.time.tickRate;
    for (let t = 0; t < fx.minutes * 60 * rate; t++) { sim.stepWorld(w); w.music.notes.length = 0; }
    const bad = w.cells.find((c) => ![c.x, c.y, c.vx, c.vy, c.energy, c.held, c.theta, c.age, c.elder].every(Number.isFinite));
    if (bad || !Number.isFinite(sim.nutrientInventory(w)) || !Number.isFinite(w.wind)) throw new Error(bad ? 'cell ' + bad.id + ' has a non-finite field' : 'non-finite world');
    fixtureLines.push(`${f}: loads and lives on (${sim.aliveCount(w)} cells after ${fx.minutes} min, ${sim.worldChecksum(w) === fx.checksum ? 'the same world as when saved' : 'the rules have changed since it was saved'})`);
  } catch (e) {
    fixturesOk = false;
    fixtureLines.push(`${f}: BROKEN: ${e.message}`);
  }
}
console.log(fixtureLines.length ? 'old saves: ' + (fixturesOk ? 'all load' : 'SOME FAIL') + '\n  ' + fixtureLines.join('\n  ') : 'old saves: none in tools/fixtures');
if (!fixturesOk) process.exitCode = 1;

function median(a) { const s = [...a].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; }
