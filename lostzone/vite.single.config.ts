import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 单文件构建：产物为一个自包含 index.html，双击即可游玩（无需安装 Node）
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    target: 'es2022',
    outDir: 'dist-single',
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
  },
});
