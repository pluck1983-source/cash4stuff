import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const svg = readFileSync(path.join(dir, 'icon-source.svg'));
const outDir = path.join(dir, '..', 'public', 'icons');

const sizes = [
  // iOS and Android maskable icons round the corners themselves - a pre-rounded tile would show dark corners.
  { name: 'apple-touch-icon.png', size: 180, square: true },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'icon-maskable-512.png', size: 512, square: true },
  { name: 'favicon-32.png', size: 32 },
];

const squareSvg = Buffer.from(svg.toString().replace('rx="112"', 'rx="0"'));

for (const { name, size, square } of sizes) {
  await sharp(square ? squareSvg : svg, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(path.join(outDir, name));
  console.log('wrote', name);
}
