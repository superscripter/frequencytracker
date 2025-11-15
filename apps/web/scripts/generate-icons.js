// Icon generation script
// This script creates PWA icons from the source iconTab.png

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sizes = [
  { size: 192, name: 'icon-192.png' },
  { size: 512, name: 'icon-512.png' },
  { size: 192, name: 'icon-maskable-192.png', maskable: true },
  { size: 512, name: 'icon-maskable-512.png', maskable: true }
];

console.log('Icon generation script');
console.log('To generate icons, you can use one of these methods:');
console.log('');
console.log('Method 1: Using online tools');
console.log('- Visit https://realfavicongenerator.net/');
console.log('- Upload apps/web/public/iconTab.png');
console.log('- Download and extract icons to apps/web/public/');
console.log('');
console.log('Method 2: Using sharp (install with: npm install sharp)');
console.log('');

// Try to use sharp if available
try {
  const sharpModule = await import('sharp');
  const sharp = sharpModule.default;
  const sourcePath = path.join(__dirname, '../public/iconTab.png');
  const publicPath = path.join(__dirname, '../public');

  async function generateIcons() {
    for (const { size, name, maskable } of sizes) {
      const outputPath = path.join(publicPath, name);

      let pipeline = sharp(sourcePath).resize(size, size, {
        fit: 'contain',
        background: maskable ? { r: 255, g: 255, b: 255, alpha: 1 } : { r: 255, g: 255, b: 255, alpha: 0 }
      });

      if (maskable) {
        // Add padding for maskable icons (safe zone)
        pipeline = pipeline.extend({
          top: Math.floor(size * 0.1),
          bottom: Math.floor(size * 0.1),
          left: Math.floor(size * 0.1),
          right: Math.floor(size * 0.1),
          background: { r: 59, g: 130, b: 246, alpha: 1 } // theme color
        }).resize(size, size);
      }

      await pipeline.png().toFile(outputPath);
      console.log(`✓ Generated ${name}`);
    }
    console.log('\nAll icons generated successfully!');
  }

  generateIcons().catch(console.error);

} catch (err) {
  console.log('Sharp not installed. Install it with:');
  console.log('npm install sharp');
  console.log('');
  console.log('Or manually create these files in apps/web/public/:');
  sizes.forEach(({ name, size }) => {
    console.log(`- ${name} (${size}x${size})`);
  });
}
