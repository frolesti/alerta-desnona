/**
 * Script per generar icones PNG des del favicon SVG.
 * 
 * Requereix: npm install -D sharp
 * Executa:   npx tsx scripts/generate-icons.ts
 * 
 * Genera:
 *   client/public/icons/icon-192.png
 *   client/public/icons/icon-512.png
 *   client/public/icons/icon-maskable-192.png  (amb padding)
 *   client/public/icons/icon-maskable-512.png  (amb padding)
 */

import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const SVG_PATH = path.join(__dirname, '../client/public/favicon.svg');
const OUT_DIR = path.join(__dirname, '../client/public/icons');

const SIZES = [192, 512];
const BG_COLOR = '#0f1117';
const MASKABLE_PADDING = 0.2; // 20% safe zone for maskable icons

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const svgBuffer = fs.readFileSync(SVG_PATH);

  for (const size of SIZES) {
    // Regular icon (SVG centrat sobre fons fosc)
    await sharp(svgBuffer)
      .resize(size, size, { fit: 'contain', background: BG_COLOR })
      .png()
      .toFile(path.join(OUT_DIR, `icon-${size}.png`));
    console.log(`  icon-${size}.png`);

    // Maskable icon (amb padding extra per safe zone)
    const innerSize = Math.round(size * (1 - MASKABLE_PADDING * 2));
    const inner = await sharp(svgBuffer)
      .resize(innerSize, innerSize, { fit: 'contain', background: 'transparent' })
      .png()
      .toBuffer();

    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: BG_COLOR,
      },
    })
      .composite([{ input: inner, gravity: 'center' }])
      .png()
      .toFile(path.join(OUT_DIR, `icon-maskable-${size}.png`));
    console.log(`  icon-maskable-${size}.png`);
  }

  console.log('\nIcones generades a client/public/icons/');
}

main().catch(console.error);
