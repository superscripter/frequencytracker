const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sourceIcon = path.join(__dirname, '../apps/web/public/frequencytrackericon.png');
const outputDir = path.join(__dirname, '../apps/web/public');

async function generateIcons() {
  console.log('Generating PWA icons from frequencytrackericon.png...');

  if (!fs.existsSync(sourceIcon)) {
    console.error('Error: frequencytrackericon.png not found at', sourceIcon);
    process.exit(1);
  }

  try {
    // Read the source image
    const image = sharp(sourceIcon);
    const metadata = await image.metadata();
    console.log(`Source image: ${metadata.width}x${metadata.height}`);

    // Generate standard icons (no padding)
    console.log('Generating icon-192.png...');
    await image
      .resize(192, 192, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path.join(outputDir, 'icon-192.png'));

    console.log('Generating icon-512.png...');
    await image
      .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path.join(outputDir, 'icon-512.png'));

    // Generate maskable icons (with 20% padding and white background)
    console.log('Generating icon-maskable-192.png...');
    await sharp({
      create: {
        width: 192,
        height: 192,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
      .composite([
        {
          input: await image.resize(154, 154, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(),
          top: 19,
          left: 19
        }
      ])
      .png()
      .toFile(path.join(outputDir, 'icon-maskable-192.png'));

    console.log('Generating icon-maskable-512.png...');
    await sharp({
      create: {
        width: 512,
        height: 512,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
      .composite([
        {
          input: await image.resize(410, 410, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(),
          top: 51,
          left: 51
        }
      ])
      .png()
      .toFile(path.join(outputDir, 'icon-maskable-512.png'));

    console.log('✅ All icons generated successfully!');
    console.log('Generated files:');
    console.log('  - icon-192.png');
    console.log('  - icon-512.png');
    console.log('  - icon-maskable-192.png');
    console.log('  - icon-maskable-512.png');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
