// Génère assets/icon.png (1024x1024) et assets/icon.ico — fond sombre avec
// lueur violette tamisée, symbole néon : une flèche qui se divise en deux
// (1 vidéo source → plusieurs variantes générées). Dépendances zéro (zlib
// natif), tout en pixels calculés à la main.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 1024; // 1024 minimum pour la génération .icns macOS par electron-builder
const OUT_DIR = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
function hexToRgb(hex) {
  hex = hex.replace('#', '');
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

const violet = hexToRgb('a78bfa'); // coeur du néon, plus clair
const pink   = hexToRgb('e879f9'); // teinte du halo extérieur
const bgDark = hexToRgb('0a0a14'); // fond quasi noir, légèrement violet
const bgGlow = hexToRgb('1f1235'); // lueur tamisée derrière le symbole

// ── Distance point→segment (pour les traits du néon) ──────────────────
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = clamp01(t);
  const cx = x1 + t * dx, cy = y1 + t * dy;
  const ex = px - cx, ey = py - cy;
  return Math.sqrt(ex * ex + ey * ey);
}

// ── Symbole : une flèche qui se divise en deux (espace de design 0..100) ──
// Un seul trait entre à gauche, se sépare en deux branches qui pointent
// chacune vers une pointe de flèche — "une vidéo source, plusieurs
// variantes générées", pas juste une forme décorative.
const forkX = 44, forkY = 50;
const segments = [
  // Tige d'entrée
  [18, 50, forkX, forkY],
  // Branche du haut + sa pointe de flèche
  [forkX, forkY, 74, 27],
  [74, 27, 64, 25],
  [74, 27, 70, 36],
  // Branche du bas + sa pointe de flèche
  [forkX, forkY, 74, 73],
  [74, 73, 64, 75],
  [74, 73, 70, 64],
].map(([x1, y1, x2, y2]) => [x1, y1, x2, y2].map((v, i) => v / 100 * SIZE));

function minDistToSymbol(x, y) {
  let best = Infinity;
  for (const [x1, y1, x2, y2] of segments) {
    const d = distToSegment(x, y, x1, y1, x2, y2);
    if (d < best) best = d;
  }
  return best;
}

const radius = SIZE * 0.225; // coins arrondis du fond
function roundedMask(x, y) {
  const rx = x < radius ? radius - x : (x > SIZE - radius ? x - (SIZE - radius) : 0);
  const ry = y < radius ? radius - y : (y > SIZE - radius ? y - (SIZE - radius) : 0);
  if (rx === 0 || ry === 0) return 1;
  const d = Math.sqrt(rx * rx + ry * ry);
  return d <= radius ? 1 : clamp01(1 - (d - radius));
}

const pixels = Buffer.alloc(SIZE * SIZE * 4);
const cx = SIZE * 0.5, cy = SIZE * 0.5;
const glowRadius = SIZE * 0.62;

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const idx = (y * SIZE + x) * 4;
    const mask = roundedMask(x, y);
    if (mask === 0) { pixels[idx + 3] = 0; continue; }

    // ── Fond : quasi-noir avec une lueur violette tamisée au centre ──
    const dx = x - cx, dy = y - cy * 0.92;
    const distCenter = Math.sqrt(dx * dx + dy * dy);
    const ambient = Math.max(0, 1 - distCenter / glowRadius) * 0.55;
    let r = lerp(bgDark[0], bgGlow[0], ambient);
    let g = lerp(bgDark[1], bgGlow[1], ambient);
    let b = lerp(bgDark[2], bgGlow[2], ambient);

    // ── Néon : halo large et doux, puis cœur fin et brillant ──
    const d = minDistToSymbol(x, y);
    const strokeHalf = SIZE * 0.016;       // épaisseur du trait "physique"
    const haloWide   = strokeHalf * 9;     // halo large, très doux
    const haloMid    = strokeHalf * 4;     // halo moyen, plus marqué
    const core       = strokeHalf * 1.0;   // cœur lumineux du tube néon

    const haloWideCov = smoothstep(haloWide, haloWide * 0.15, d) * 0.22;
    const haloMidCov  = smoothstep(haloMid, haloMid * 0.2, d) * 0.45;
    const coreCov     = smoothstep(core * 2.2, 0, d);

    // Halo : teinte violet→pink, en plus du fond
    r = lerp(r, pink[0], haloWideCov);
    g = lerp(g, pink[1], haloWideCov);
    b = lerp(b, pink[2], haloWideCov);
    r = lerp(r, violet[0], haloMidCov);
    g = lerp(g, violet[1], haloMidCov);
    b = lerp(b, violet[2], haloMidCov);
    // Cœur : blanc-violet très lumineux (effet tube néon allumé)
    r = lerp(r, 255, coreCov * 0.85);
    g = lerp(g, 255, coreCov * 0.85);
    b = lerp(b, 255, coreCov * 0.92);

    pixels[idx]     = Math.round(r);
    pixels[idx + 1] = Math.round(g);
    pixels[idx + 2] = Math.round(b);
    pixels[idx + 3] = Math.round(255 * mask);
  }
}

// ── PNG encoding ──────────────────────────────────────────────
function crc32(buf) {
  let c, crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xFF;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function downscale(srcSize, dstSize, rgba) {
  const out = Buffer.alloc(dstSize * dstSize * 4);
  const ratio = srcSize / dstSize;
  for (let y = 0; y < dstSize; y++) {
    for (let x = 0; x < dstSize; x++) {
      // box filter moyenné sur la zone source correspondante
      const sx0 = Math.floor(x * ratio), sx1 = Math.floor((x + 1) * ratio);
      const sy0 = Math.floor(y * ratio), sy1 = Math.floor((y + 1) * ratio);
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = sy0; sy < Math.max(sy1, sy0 + 1); sy++) {
        for (let sx = sx0; sx < Math.max(sx1, sx0 + 1); sx++) {
          const si = (sy * srcSize + sx) * 4;
          r += rgba[si]; g += rgba[si + 1]; b += rgba[si + 2]; a += rgba[si + 3];
          n++;
        }
      }
      const di = (y * dstSize + x) * 4;
      out[di] = Math.round(r / n); out[di + 1] = Math.round(g / n);
      out[di + 2] = Math.round(b / n); out[di + 3] = Math.round(a / n);
    }
  }
  return out;
}

function buildIco(entries) {
  const iconDir = Buffer.alloc(6);
  iconDir.writeUInt16LE(0, 0);
  iconDir.writeUInt16LE(1, 2);
  iconDir.writeUInt16LE(entries.length, 4);

  let offset = 6 + entries.length * 16;
  const dirEntries = [];
  const imgBuffers = [];
  for (const { size, png } of entries) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0; entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    dirEntries.push(entry);
    imgBuffers.push(png);
  }
  return Buffer.concat([iconDir, ...dirEntries, ...imgBuffers]);
}

const png512 = encodePNG(SIZE, SIZE, pixels);
fs.writeFileSync(path.join(OUT_DIR, 'icon.png'), png512);

const sizes = [256, 128, 64, 48, 32, 16];
const icoEntries = sizes.map(size => {
  const scaled = size === SIZE ? pixels : downscale(SIZE, size, pixels);
  return { size, png: encodePNG(size, size, scaled) };
});
const ico = buildIco(icoEntries);
fs.writeFileSync(path.join(OUT_DIR, 'icon.ico'), ico);

console.log('✅ assets/icon.png (' + SIZE + 'x' + SIZE + ') et assets/icon.ico (' + sizes.join(',') + ') générés — fond sombre, flèche néon qui se divise en deux');
