// Draws MONAD's app icons as pixel art from the page's own palette: a centric diatom seen face-on (a glass valve
// with radial striae, a lit rim and golden chloroplasts) in banded, dithered water. 32 x 32 art pixels, scaled up
// by whole numbers. The diatom stays inside the central circle, so the same icon serves as "maskable".
//
//   node tools/make-icons.mjs        writes icons/icon-192.png and icons/icon-512.png

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const P = new Function(html.slice(html.indexOf('// ===== PARAMS ====='), html.indexOf('// ===== Fields =====')) +
  '\nreturn { PALETTE_HEX, COL, rampBase, bayer, OUTLINE, SHADOW, BASE, HIGHLIGHT, BRIGHT, GOLD, LIGHTBLUE, BLUE };')();

const N = 32, C = 15.5;
const art = new Uint8Array(N * N);
const blue = P.rampBase(P.LIGHTBLUE), deep = P.rampBase(P.BLUE), gold = P.rampBase(P.GOLD);

// Water: bands from the lit surface water down to the deep, dithered only near each seam
const WATER = [6, 5, 4, 3, 2, 1];
for (let y = 0; y < N; y++) {
  const f = y / (N - 1) * (WATER.length - 1), band = Math.floor(f), t = f - band;
  for (let x = 0; x < N; x++) {
    const next = Math.min(WATER.length - 1, band + 1);
    art[y * N + x] = t > 0.6 && P.bayer(x, y) < (t - 0.6) / 0.4 ? WATER[next] : WATER[band];
  }
}
for (const [x, y] of [[4, 6], [27, 9], [6, 25], [25, 27], [29, 19]]) art[y * N + x] = P.COL.SHAFT;   // marine snow

// The valve: outline, a rim lit from the upper left, a face of radial striae around a central areola
const R = 10.5;
for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    const dx = x - C, dy = y - C, d = Math.hypot(dx, dy), lit = -(dx + dy) / (d || 1);   // 1 = facing the light
    if (d > R) continue;
    let idx;
    if (d > R - 1) idx = deep + P.OUTLINE;
    else if (d > R - 2.2) idx = blue + (lit > 0.5 ? P.BRIGHT : lit > -0.3 ? P.HIGHLIGHT : P.SHADOW);
    else {
      const a = Math.atan2(dy, dx) / (2 * Math.PI) * 14, stria = d > 6.4 && a - Math.floor(a) < 0.3;
      idx = blue + (d < 1.6 ? P.HIGHLIGHT : stria ? P.SHADOW : P.BASE);
      if (d > 6.4 && lit > 0.7 && !stria) idx = blue + P.HIGHLIGHT;
    }
    art[y * N + x] = idx;
  }
}
// Golden chloroplast discs around the middle, each shaded on its own
for (let k = 0; k < 5; k++) {
  const a = k / 5 * 2 * Math.PI + 0.4, px = C + Math.cos(a) * 3.9, py = C + Math.sin(a) * 3.9;
  for (let y = Math.floor(py - 2); y <= py + 2; y++) {
    for (let x = Math.floor(px - 2); x <= px + 2; x++) {
      const dx = x - px, dy = y - py, d = Math.hypot(dx, dy);
      if (d > 1.7) continue;
      art[y * N + x] = gold + (d > 1.25 ? P.SHADOW : dx + dy < -0.6 ? P.BRIGHT : dx + dy < 0.4 ? P.HIGHLIGHT : P.BASE);
    }
  }
}
art[8 * N + 10] = P.COL.GLOW;   // a glint on the glass

function png(scale) {
  const S = N * scale, rgb = P.PALETTE_HEX.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  const raw = Buffer.alloc(S * (S * 3 + 1));
  for (let y = 0; y < S; y++) {
    raw[y * (S * 3 + 1)] = 0;
    for (let x = 0; x < S; x++) {
      const c = rgb[art[Math.floor(y / scale) * N + Math.floor(x / scale)]], o = y * (S * 3 + 1) + 1 + x * 3;
      raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2];
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4), body = Buffer.concat([Buffer.from(type), data]), sum = Buffer.alloc(4);
    len.writeUInt32BE(data.length); sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 2;   // 8-bit RGB
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync(new URL('../icons/', import.meta.url), { recursive: true });
for (const [size, scale] of [[192, 6], [512, 16]]) writeFileSync(new URL(`../icons/icon-${size}.png`, import.meta.url), png(scale));
