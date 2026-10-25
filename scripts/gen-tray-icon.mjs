// Generates the Emberling tray icon (32x32 PNG) by rasterizing the brand mark
// — dark tile, brand dot, orbit ring with occlusion, satellite bead — and
// prints it as a base64 data URL for electron/main.js (ORB_ICON_DATAURL).
// Usage: node scripts/gen-tray-icon.mjs
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// ——— brand geometry (64-grid, matches assets/brand/logo-mark.svg) ———
const RING = { cx: 32, cy: 32.5, rx: 28.5, ry: 10.5, rot: (-16 * Math.PI) / 180, halfW: 2.25 };
const DOT = { cx: 32, cy: 35, r: 13.5 };
const SAT = { cx: 52.8, cy: 20.3, r: 3.4 };

// ellipse + front-arc sample points (front = parametric t 0..180, the half that
// passes in front of the dot)
const ellipsePoint = (t) => {
  const ex = RING.rx * Math.cos(t);
  const ey = RING.ry * Math.sin(t);
  return {
    x: RING.cx + ex * Math.cos(RING.rot) - ey * Math.sin(RING.rot),
    y: RING.cy + ex * Math.sin(RING.rot) + ey * Math.cos(RING.rot),
  };
};
const ringSamples = [];
for (let i = 0; i < 720; i++) ringSamples.push(ellipsePoint((i / 720) * 2 * Math.PI));
const frontSamples = [];
for (let i = 0; i <= 360; i++) frontSamples.push(ellipsePoint((i / 360) * Math.PI));

const dist2 = (px, py, q) => (px - q.x) ** 2 + (py - q.y) ** 2;
const minDist = (px, py, samples) => {
  let m = Infinity;
  for (const s of samples) {
    const d = dist2(px, py, s);
    if (d < m) m = d;
  }
  return Math.sqrt(m);
};

// rounded-square tile SDF (64-grid, corner radius 18)
const inTile = (px, py) => {
  const r = 18;
  const qx = Math.abs(px - 32) - (32 - r);
  const qy = Math.abs(py - 32) - (32 - r);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) <= 0;
};

const COLORS = {
  tile: [0x14, 0x14, 0x14, 1],
  ring: [0xf0, 0xf0, 0xf0, 0.92],
  dot: [0xf5, 0x4e, 0x00, 1],
  sat: [0xff, 0x6a, 0x24, 1],
};
const blend = (base, top) => {
  const a = top[3] + base[3] * (1 - top[3]);
  if (a === 0) return [0, 0, 0, 0];
  return [
    (top[0] * top[3] + base[0] * base[3] * (1 - top[3])) / a,
    (top[1] * top[3] + base[1] * base[3] * (1 - top[3])) / a,
    (top[2] * top[3] + base[2] * base[3] * (1 - top[3])) / a,
    a,
  ];
};

function sample(px, py) {
  let acc = [0, 0, 0, 0];
  if (inTile(px, py)) acc = COLORS.tile;
  if (minDist(px, py, ringSamples) <= RING.halfW) acc = blend(acc, COLORS.ring);
  if ((px - DOT.cx) ** 2 + (py - DOT.cy) ** 2 <= DOT.r ** 2) acc = blend(acc, COLORS.dot);
  if (minDist(px, py, frontSamples) <= RING.halfW) acc = blend(acc, COLORS.ring);
  if ((px - SAT.cx) ** 2 + (py - SAT.cy) ** 2 <= SAT.r ** 2) acc = blend(acc, COLORS.sat);
  return acc;
}

// ——— rasterize 32x32 with 4x4 supersampling ———
const SIZE = 32;
const SS = 4;
const px = new Uint8Array(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const c = sample(((x + (sx + 0.5) / SS) / SIZE) * 64, ((y + (sy + 0.5) / SS) / SIZE) * 64);
        // premultiply-ish accumulate
        r += c[0] * c[3];
        g += c[1] * c[3];
        b += c[2] * c[3];
        a += c[3];
      }
    }
    const n = SS * SS;
    const i = (y * SIZE + x) * 4;
    px[i] = a > 0 ? Math.round(r / a) : 0;
    px[i + 1] = a > 0 ? Math.round(g / a) : 0;
    px[i + 2] = a > 0 ? Math.round(b / a) : 0;
    px[i + 3] = Math.round((a / n) * 255);
  }
}

// ——— PNG encode ———
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0; // filter: none
  Buffer.from(px.buffer, y * SIZE * 4, SIZE * 4).copy(raw, y * (SIZE * 4 + 1) + 1);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

fs.writeFileSync(path.join(here, "..", "assets", "brand", "tray@32.png"), png);
console.log(png.toString("base64"));
