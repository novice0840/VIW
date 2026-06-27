import { defineConfig } from 'vite';
import string from 'vite-plugin-string';

export default defineConfig({
  plugins: [string({ include: '**/*.wgsl', compress: false })],
});
