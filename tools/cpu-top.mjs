// Summarises a V8 CPU profile: the functions with the most self time.
//
//   node --cpu-prof --cpu-prof-dir=prof tools/bench.mjs 3 10
//   node tools/cpu-top.mjs prof [count=22]

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const dir = process.argv[2] || '.', count = Number(process.argv[3]) || 22;
const name = readdirSync(dir).filter((n) => n.endsWith('.cpuprofile')).sort().at(-1);
if (!name) throw new Error('no .cpuprofile in ' + dir);
const p = JSON.parse(readFileSync(join(dir, name), 'utf8')), ids = new Map(p.nodes.map((n) => [n.id, n])), self = new Map();
for (let i = 0; i < p.samples.length; i++) {
  const k = ids.get(p.samples[i]).callFrame.functionName || '(anonymous)';
  self.set(k, (self.get(k) || 0) + (p.timeDeltas[i] || 0));
}
const total = [...self.values()].reduce((a, b) => a + b, 0);
for (const [k, v] of [...self].sort((a, b) => b[1] - a[1]).slice(0, count)) console.log((100 * v / total).toFixed(1).padStart(5) + '%  ' + k);
