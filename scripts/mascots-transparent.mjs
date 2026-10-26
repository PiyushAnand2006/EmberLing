// Makes the 3D mascot crops background-transparent.
// Flood-fills darkness from the image borders (so dark details INSIDE the
// characters — visor, eyes, headphones — are preserved), with a soft alpha
// ramp near the threshold so edges blend instead of fringing.
// Usage: node scripts/mascots-transparent.mjs
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "assets", "brand", "characters", "3d");
const T0 = 20, T1 = 46; // luminance ramp (0-255): <=T0 fully transparent, >=T1 opaque

// ——— minimal PNG decode (8-bit, color type 2 RGB / 6 RGBA, non-interlaced) ———
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let pos = 8, width = 0, height = 0, colorType = 0, idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8) throw new Error("bit depth " + data[8] + " unsupported");
      colorType = data[9];
      if (data[12] !== 0) throw new Error("interlaced PNG unsupported");
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : null;
  if (!channels) throw new Error("color type " + colorType + " unsupported");
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const si = x * channels, di = (y * width + x) * 4;
      out[di] = cur[si];
      out[di + 1] = cur[si + 1];
      out[di + 2] = cur[si + 2];
      out[di + 3] = channels === 4 ? cur[si + 3] : 255;
    }
    prev = cur;
  }
  return { width, height, data: out };
}

// ——— PNG encode (RGBA, filter 0) ———
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
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const name of ["orby", "scout", "forge", "echo", "tempo", "sentry"]) {
  const file = path.join(dir, name + ".png");
  const { width, height, data } = decodePng(fs.readFileSync(file));
  const N = width * height;
  const lum = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  // BFS flood from border pixels that are dark enough to be background
  const state = new Uint8Array(N); // 0 unknown, 1 in queue/visited
  const queue = new Int32Array(N);
  let qh = 0, qt = 0;
  const push = (i) => {
    if (!state[i] && lum[i] < T1) { state[i] = 1; queue[qt++] = i; }
  };
  for (let x = 0; x < width; x++) { push(x); push((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { push(y * width); push(y * width + width - 1); }
  while (qh < qt) {
    const i = queue[qh++];
    const x = i % width, y = (i / width) | 0;
    if (x > 0) push(i - 1);
    if (x < width - 1) push(i + 1);
    if (y > 0) push(i - width);
    if (y < height - 1) push(i + width);
  }
  // soft alpha ramp inside the flooded region
  for (let i = 0; i < N; i++) {
    if (state[i]) {
      const t = Math.min(1, Math.max(0, (lum[i] - T0) / (T1 - T0)));
      data[i * 4 + 3] = Math.round(t * 255);
    }
  }
  fs.writeFileSync(file, encodePng(width, height, data));
  console.log(name, "transparent,", width + "x" + height);
}
