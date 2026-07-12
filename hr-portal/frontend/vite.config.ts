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
    // 显式接受 vendor-element 全量引入的 chunk 体积。
    // 原因：项目使用 Element Plus 全局注册（import ElementPlus from 'element-plus'），
    // 所有组件一次性打包，单 chunk 约 940 KB。
    // 后续可按需引入（unplugin-vue-components）进一步优化。
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // vendor — 第三方库按框架/UI/工具拆包，避免循环引用
          if (id.includes('node_modules/element-plus')) return 'vendor-element'
          if (id.includes('node_modules/echarts')) return 'vendor-echarts'
          if (id.includes('node_modules/@vueuse')) return 'vendor-vueuse'
          if (id.includes('node_modules/vue') || id.includes('node_modules/pinia')) return 'vendor-vue'
          if (id.includes('node_modules/@vueflow') || id.includes('node_modules/@vue-flow')) return 'vendor-vueflow'
          // UCP views — 路由已做懒加载（dynamic import），由 Vite 自动拆包，
          // 不做 manualChunks，避免 tabs/components 与 views 之间的循环依赖
          // other large views
          if (id.includes('views/report/ReportDesigner')) return 'report-designer'
        },
      },
    },
  },
})