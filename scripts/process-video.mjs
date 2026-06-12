import ffmpegStatic from 'ffmpeg-static';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ffmpeg = require('fluent-ffmpeg');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

ffmpeg.setFfmpegPath(ffmpegStatic);

const input  = path.join(__dirname, '../public/video-src.mp4');
const output = path.join(__dirname, '../public/intro.mp4');

console.log('Procesando video...');
console.log('  - Quitando audio');
console.log('  - Adaptando a vertical 9:16 (390x844)');
console.log('  - Comprimiendo para web móvil');

ffmpeg(input)
  .noAudio()
  // Crop y resize a 9:16 vertical centrado
  .videoFilter([
    // Escala manteniendo relación de aspecto con el lado más corto = 390
    'scale=390:844:force_original_aspect_ratio=increase',
    // Recorta al centro exacto 390x844
    'crop=390:844'
  ])
  .videoCodec('libx264')
  .outputOptions([
    '-preset fast',
    '-crf 28',          // Compresión buena calidad/peso
    '-movflags +faststart',  // Permite reproducir mientras carga
    '-pix_fmt yuv420p'  // Compatibilidad máxima iOS/Android
  ])
  .output(output)
  .on('progress', p => {
    if (p.percent) process.stdout.write(`\r  Progreso: ${Math.round(p.percent)}%   `);
  })
  .on('end', () => {
    console.log('\n✓ intro.mp4 generado');
    import('fs').then(({ default: fs }) => {
      const stats = fs.statSync(output);
      console.log(`  Tamaño: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    });
  })
  .on('error', err => {
    console.error('Error:', err.message);
    process.exit(1);
  })
  .run();
