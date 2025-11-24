const sharp = require('sharp');
const path = require('path');

const sourceIcon = path.join(__dirname, '../apps/web/public/frequencytrackericon.png');
const outputDir = path.join(__dirname, '../apps/web/public');

async function generateAdditionalIcons() {
  console.log('Generating additional icons...');

  const image = sharp(sourceIcon);

  // Generate apple-icon.png (180x180 for iOS)
  console.log('Generating apple-icon.png...');
  await image
    .resize(180, 180, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(outputDir, 'apple-icon.png'));

  // Generate icon.png (32x32 for favicon)
  console.log('Generating icon.png...');
  await image
    .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(outputDir, 'icon.png'));

  console.log('✅ Additional icons generated successfully!');
}

generateAdditionalIcons().catch(console.error);
