import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  base: './',
  plugins: [svelte()],
  // 不监听缓存与构建产物等大目录
  server: { watch: { ignored: ['**/.cache/**', '**/dist/**'] } },
  // 全量排行、逐干员遍历类用例较重，在慢机器或 CI 上会超过默认 5 秒
  test: { include: ['src/**/*.test.ts', 'tools/**/*.test.ts'], testTimeout: 60_000 },
});
