import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false, // Disabled for serverless deployment
  splitting: false,
  sourcemap: true,
  clean: true,
  target: 'node18',
  external: ['@prisma/client', '.prisma/client'],
});
