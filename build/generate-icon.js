// Génère assets/icon.png (256x256) et assets/icon.ico — mark géométrique "N"
// stylisé (pas d'émoji), dégradé violet→pink, dépendances zéro (zlib natif).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 1024; // 1024 minimum pour la génération .icns macOS par electron-builder
const OUT_DIR = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

function lerp(a, b, t) { return a + (b - a) * t; }
function hexToRgb(hex) {
  hex = hex.replace('#', '');
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

const purple = hexToRgb('7c3aed');
const pink = hexToRgb('c026d3');

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// ── Monogramme "N" géométrique (espace de design 0..100) ──────
const barW = 11;
const top = 22, bottom = 78, left = 26, right = 74;
const leftBar  = [[left, top], [left + barW, top], [left + barW, bottom], [left, bottom]];
const rightBar = [[right - barW, top], [right, top], [right, bottom], [right - barW, bottom]];
const diagonal  = [[left, top], [left + barW, top], [right, bottom], [right - barW, bottom]];
const glyphPolys = [leftBar, rightBar, diagonal].map(poly => poly.map(([x, y]) => [x / 100 * SIZE, y / 100 * SIZE]));

function inGlyph(x, y) {
  for (const poly of glyphPolys) if (pointInPolygon(x, y, poly)) return true;
  return false;
}

// Anti-aliasing léger par supersampling 2x2
function coverage(testFn, x, y) {
  let hits = 0;
  const offs = [0.25, 0.75];
  for (const oy of offs) for (const ox of offs) if (testFn(x + ox, y + oy)) hits++;
  return hits / 4;
}

const radius = SIZE * 0.225; // rounded corners
function roundedCoverageTest(x, y) {
  const rx = x < radius ? radius - x : (x > SIZE - radius ? x - (SIZE - radius) : 0);
  const ry = y < radius ? radius - y : (y > SIZE - radius ? y - (SIZE - radius) : 0);
  if (rx === 0 || ry === 0) return true;
  return (rx * rx + ry * ry) <= radius * radius;
}

const pixels = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const idx = (y * SIZE + x) * 4;
    const maskCov = coverage(roundedCoverageTest, x, y);
    if (maskCov === 0) { pixels[idx + 3] = 0; continue; }

    // Dégradé diagonal + légère lumière glossy en haut-gauche
    const t = (x + y) / (SIZE * 2);
    let r = lerp(purple[0], pink[0], t);
    let g = lerp(purple[1], pink[1], t);
    let b = lerp(purple[2], pink[2], t);
    const dx = x / SIZE - 0.22, dy = y / SIZE - 0.18;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const glow = Math.max(0, 1 - dist / 0.55) * 0.16;
    r = lerp(r, 255, glow); g = lerp(g, 255, glow); b = lerp(b, 255, glow);

    // Monogramme blanc avec anti-aliasing
    const glyphCov = coverage(inGlyph, x, y);
    if (glyphCov > 0) {
      r = lerp(r, 255, glyphCov);
      g = lerp(g, 255, glyphCov);
      b = lerp(b, 255, glyphCov);
    }

    pixels[idx] = Math.round(r);
    pixels[idx + 1] = Math.round(g);
    pixels[idx + 2] = Math.round(b);
    pixels[idx + 3] = Math.round(255 * maskCov);
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

console.log('✅ assets/icon.png (' + SIZE + 'x' + SIZE + ') et assets/icon.ico (' + sizes.join(',') + ') générés — monogramme N, sans émoji');
