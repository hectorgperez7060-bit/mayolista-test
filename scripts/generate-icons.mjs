import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const input = path.join(__dirname, '../public/logo-new.jpg');

const meta = await sharp(input).metadata();
console.log(`Original: ${meta.width}x${meta.height}`);

// Blue background matching the logo's own circle
const bg = { r: 29, g: 90, b: 149, alpha: 255 };

async function buildIcon(canvasSize) {
  // Resize the logo to fill the full canvas
  const resized = await sharp(input)
    .resize(canvasSize, canvasSize, { fit: 'cover', position: 'center' })
    .toBuffer();

  // Circular mask — cuts the white corners, keeps the circle
  const mask = Buffer.from(
    `<svg width="${canvasSize}" height="${canvasSize}">
       <circle cx="${canvasSize / 2}" cy="${canvasSize / 2}" r="${canvasSize / 2}" fill="white"/>
     </svg>`
  );

  const circular = await sharp(resized)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  // Composite the circle onto a solid blue square
  // (so Android adaptive icon has no transparent corners)
  return sharp({
    create: { width: canvasSize, height: canvasSize, channels: 4, background: bg }
  })
    .composite([{ input: circular, left: 0, top: 0 }])
    .png();
}

for (const size of [512, 192]) {
  await (await buildIcon(size)).toFile(path.join(__dirname, `../public/icon3-${size}.png`));
  console.log(`✓ icon3-${size}.png`);
}

const check = await sharp(path.join(__dirname, '../public/icon3-512.png')).metadata();
console.log(`Verificación: ${check.width}x${check.height} ${check.format} ✓`);
