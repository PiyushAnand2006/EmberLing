// Builds a throwaway page that runs the SAME tint algorithm as
// src/components/Brand.tsx against the real mascot PNGs with aggressive
// recolors, to verify bodies take the hex while ring/gear/eyes/shading hold.
// Usage: node scripts/tint-verify-page.mjs  -> %TEMP%/tint-check.html
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "assets", "brand", "characters", "3d");
const SRC = {};
for (const n of ["orby", "scout", "forge", "echo", "tempo", "sentry"])
  SRC[n] = "data:image/png;base64," + fs.readFileSync(path.join(dir, n + ".png")).toString("base64");

const CASES = [
  ["orby", "#126fd4", "Orby → blue"],
  ["scout", "#c82532", "Scout → red"],
  ["forge", "#c82779", "Forge → magenta"],
  ["echo", "#0d9381", "Echo → teal"],
  ["tempo", "#7442d1", "Tempo → purple"],
  ["sentry", "#0d9655", "Sentry → green"],
];

const cells = CASES.map(
  ([face, , label]) =>
    `<div class="cell" data-face="${face}" data-label="${label}"><canvas width="557" height="395" style="width:200px;height:142px"></canvas><div class="lbl"></div></div>`
).join("\n");

const srcs = JSON.stringify(SRC);
const casesJson = JSON.stringify(CASES.map(([f, h]) => [f, h]));

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#141414;color:#f0f0f0;font-family:system-ui,sans-serif;padding:18px}
.row{display:flex;gap:16px;flex-wrap:wrap}
.cell{text-align:center;background:#181818;border:1px solid rgba(255,255,255,.09);border-radius:12px;padding:8px 10px}
.cell canvas{display:block}
.lbl{font-size:11px;color:#fcfcfc70;margin-top:4px}
h2{font-size:14px;margin:0 0 10px;color:#fcfcfc99}
</style></head><body>
<h2>hex tint check — body remaps, ring/gear/eyes/shading preserved</h2>
<div class="row">${cells}</div>
<script>
const SRC = ${srcs};
const CASES = ${casesJson};
function hexToRgb(hex){const v=hex.replace("#","");const s=v.length===3?v.split("").map(function(c){return c+c;}).join(""):v;const n=parseInt(s,16);return[(n>>16)&255,(n>>8)&255,n&255];}
function rgbToHsl(r,g,b){r/=255;g/=255;b/=255;var max=Math.max(r,g,b),min=Math.min(r,g,b);var l=(max+min)/2;if(max===min)return[0,0,l];var d=max-min;var s=l>0.5?d/(2-max-min):d/(max+min);var h=max===r?((g-b)/d+(g<b?6:0)):max===g?((b-r)/d+2):((r-g)/d+4);return[h*60,s,l];}
function hslToRgb(h,s,l){h=((h%360)+360)%360;var c=(1-Math.abs(2*l-1))*s;var x=c*(1-Math.abs(((h/60)%2)-1));var m=l-c/2;var t=[[c,x,0],[x,c,0],[0,c,x],[0,x,c],[x,0,c],[c,0,x]][Math.floor(h/60)%6];return[(t[0]+m)*255,(t[1]+m)*255,(t[2]+m)*255];}
function toHsl(rgb){var hsl=rgbToHsl.apply(null,rgb);return{h:hsl[0],s:hsl[1],l:hsl[2]};}
var MASCOT_BODY = { orby: toHsl(hexToRgb("#f54e00")), scout: toHsl(hexToRgb("#599ce7")), forge: toHsl(hexToRgb("#3fa266")), echo: toHsl(hexToRgb("#b48ead")), tempo: toHsl(hexToRgb("#f1b467")), sentry: toHsl(hexToRgb("#9386f2")) };
var cells = document.querySelectorAll(".cell");
var pending = cells.length;
cells.forEach(function (cell) {
  var face = cell.dataset.face;
  var img = new Image();
  img.onload = function () {
    var canvas = cell.querySelector("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    var hex = CASES.find(function (c) { return c[0] === face; })[1];
    var label = cell.dataset.label + "  (" + hex + ")";
    cell.querySelector(".lbl").textContent = label;
    var image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var px = image.data;
    var body = MASCOT_BODY[face];
    var t = rgbToHsl.apply(null, hexToRgb(hex));
    var sScale = body.s > 0.01 ? t[1] / body.s : 1;
    var lScale = t[2] / body.l;
    for (var i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0) continue;
      var hsl = rgbToHsl(px[i], px[i + 1], px[i + 2]);
      var h = hsl[0], s = hsl[1], l = hsl[2];
      if (s < 0.15) continue;
      var dist = 180 - Math.abs((Math.abs(h - body.h) % 360) - 180);
      if (dist >= 55) continue;
      var blend = dist <= 25 ? 1 : (55 - dist) / 30;
      var ns = Math.min(1, s * sScale);
      var nl = Math.min(1, Math.max(0, l * lScale));
      var rgb = hslToRgb(t[0], ns, nl);
      px[i] = Math.round(px[i] + (rgb[0] - px[i]) * blend);
      px[i + 1] = Math.round(px[i + 1] + (rgb[1] - px[i + 1]) * blend);
      px[i + 2] = Math.round(px[i + 2] + (rgb[2] - px[i + 2]) * blend);
    }
    ctx.putImageData(image, 0, 0);
    if (--pending === 0) document.title = "DONE";
  };
  img.src = SRC[face];
});
</script></body></html>`;

const out = path.join(process.env.TEMP || "/tmp", "tint-check.html");
fs.writeFileSync(out, html);
console.log("written", out);
