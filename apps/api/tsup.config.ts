import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false, // Disabled for serverless deployment
  splitting: false,
  sourcemap: true,
  clean: true,
  target: 'node18',
  bundle: true,
  // External packages that should not be bundled
  external: [
    '@prisma/client',
    '.prisma/client',
    'bcrypt',
    '@mapbox/node-pre-gyp',
  ],
  // Bundle internal workspace packages
  noExternal: ['@frequency-tracker/database'],
});
