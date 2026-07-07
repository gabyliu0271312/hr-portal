import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 800,  // Element Plus 全局注册 ~778KB，阈值调至 800KB
    rollupOptions: {
      output: {
        manualChunks(id) {
          // ── 框架层 ──
          if (id.includes('node_modules/vue') || id.includes('node_modules/@vue')) {
            if (id.includes('vue-router')) return 'vue-router'
            if (id.includes('pinia')) return 'pinia'
            return 'vue-core'
          }
          // ── UI 层：element-plus 拆成 core + icons ──
          if (id.includes('node_modules/element-plus')) {
            if (id.includes('icons-vue') || id.includes('@element-plus/icons')) return 'element-icons'
            return 'element-plus'
          }
          // ── 流程图 ──
          if (id.includes('@vue-flow') || id.includes('dagre')) return 'vue-flow'
          // ── 其他大型库 ──
          if (id.includes('node_modules/@antv')) return 'antv'
          if (id.includes('node_modules/axios')) return 'axios'
          if (id.includes('node_modules/lodash')) return 'lodash'
          if (id.includes('node_modules/sortablejs')) return 'sortable'
          // ── 其余 node_modules 按包名自动拆 ──
          if (id.includes('node_modules')) {
            const m = id.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)/)
            if (m) return `lib-${m[1].replace('@', '').replace('/', '-')}`
          }
        },
      },
    },
  },
})