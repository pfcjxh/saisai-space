/**
 * PWA / iOS 图标生成器（零依赖，Node 内置 zlib 手工编码 PNG）。
 *
 * 设计：OLED 纯黑底 + 米菲 Warm Amber 心形（参数曲线 (x²+y²-1)³ = x²y³）
 *       + 左上角小八 Serene Blue 圆点，2x2 超采样抗锯齿。
 *
 * 产出（public/icons/）：
 *   - icon-192.png          manifest any
 *   - icon-512.png          manifest any
 *   - icon-maskable-512.png manifest maskable（心形收缩至安全区 62%）
 *   - apple-touch-icon.png  iOS 主屏幕 180x180
 *
 * 用法：npm run icons
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------- PNG 编码

const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- 形状判定

const INK = [0, 0, 0];
const AMBER = [255, 174, 93];
const AMBER_DEEP = [245, 156, 66];
const SERENE = [112, 165, 216];

/** 心形隐式曲线覆盖率（2x2 超采样），scale 为心形占画布比例系数 */
function heartCoverage(px, py, size, scale) {
  let hits = 0;
  for (let sy = 0; sy < 2; sy++) {
    for (let sx = 0; sx < 2; sx++) {
      const fx = (px + 0.25 + 0.5 * sx) / size;
      const fy = (py + 0.25 + 0.5 * sy) / size;
      const x = ((fx - 0.5) * 2.8) / scale;
      const y = ((0.52 - fy) * 2.65) / scale + 0.08;
      const a = x * x + y * y - 1;
      if (a * a * a - x * x * y * y * y <= 0) hits++;
    }
  }
  return hits / 4;
}

/** 左上角 Serene Blue 圆点覆盖率 */
function dotCoverage(px, py, size) {
  const cx = 0.32 * size;
  const cy = 0.30 * size;
  const r = 0.055 * size;
  const dx = px + 0.5 - cx;
  const dy = py + 0.5 - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist <= r - 0.75) return 1;
  if (dist >= r + 0.75) return 0;
  return (r + 0.75 - dist) / 1.5;
}

function renderIcon(size, heartScale, withDot) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const t = y / size;
      const fg = AMBER.map((v, k) => v + (AMBER_DEEP[k] - v) * t);

      let cov = heartCoverage(x, y, size, heartScale);
      let color = fg;
      if (withDot) {
        const d = dotCoverage(x, y, size);
        if (d > 0) {
          color = SERENE;
          cov = Math.max(cov, d);
        }
      }

      for (let k = 0; k < 3; k++) {
        rgba[i + k] = Math.round(INK[k] * (1 - cov) + color[k] * cov);
      }
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

// ---------------------------------------------------------------- 产出

const targets = [
  { file: 'icon-192.png', size: 192, scale: 0.92, dot: true },
  { file: 'icon-512.png', size: 512, scale: 0.92, dot: true },
  { file: 'icon-maskable-512.png', size: 512, scale: 0.62, dot: false },
  { file: 'apple-touch-icon.png', size: 180, scale: 0.92, dot: true },
];

for (const t of targets) {
  const png = encodePng(t.size, t.size, renderIcon(t.size, t.scale, t.dot));
  writeFileSync(join(outDir, t.file), png);
  console.log(`generated public/icons/${t.file} (${t.size}x${t.size})`);
}
