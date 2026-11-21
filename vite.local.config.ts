/**
 * 本地单文件构建：把 JS / CSS 内联进 index.html，产物可直接双击用浏览器打开（file://），无需服务器。
 * 用法：node node_modules/vite/bin/vite.js build --config vite.local.config.ts
 * 产物：dist-local/index.html（图片仍在 dist-local/assets/，相对路径加载）
 */
import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

function inlineAll(): Plugin {
  return {
    name: 'inline-all-into-html',
    enforce: 'post',
    generateBundle(_, bundle) {
      const html = Object.values(bundle).find((f) => f.type === 'asset' && f.fileName === 'index.html');
      if (!html || html.type !== 'asset') return;
      let src = String(html.source);
      for (const [name, file] of Object.entries(bundle)) {
        if (file.type === 'chunk' && file.isEntry) {
          const tag = new RegExp(`<script[^>]*src="[^"]*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*></script>`);
          // 内联模块脚本在 file:// 下可执行（不触发跨域模块加载）
          src = src.replace(tag, () => `<script type="module">${file.code.replace(/<\/script/g, '<\\/script')}</script>`);
          delete bundle[name];
        } else if (file.type === 'asset' && name.endsWith('.css')) {
          const tag = new RegExp(`<link[^>]*href="[^"]*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`);
          src = src.replace(tag, () => `<style>${String(file.source)}</style>`);
          delete bundle[name];
        }
      }
      src = src.replace(/<link rel="modulepreload"[^>]*>/g, '');
      html.source = src;
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [svelte(), inlineAll()],
  build: {
    outDir: 'dist-local',
    emptyOutDir: true,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
