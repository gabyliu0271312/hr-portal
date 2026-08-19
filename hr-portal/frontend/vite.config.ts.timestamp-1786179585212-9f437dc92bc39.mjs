// vite.config.ts
import { defineConfig } from "file:///D:/AI%E9%A1%B9%E7%9B%AE/HR%E6%8F%90%E6%95%88%E5%B7%A5%E5%85%B7%E6%90%AD%E5%BB%BA/hr-portal/frontend/node_modules/vite/dist/node/index.js";
import vue from "file:///D:/AI%E9%A1%B9%E7%9B%AE/HR%E6%8F%90%E6%95%88%E5%B7%A5%E5%85%B7%E6%90%AD%E5%BB%BA/hr-portal/frontend/node_modules/@vitejs/plugin-vue/dist/index.mjs";
import { resolve } from "path";
var __vite_injected_original_dirname = "D:\\AI\u9879\u76EE\\HR\u63D0\u6548\u5DE5\u5177\u642D\u5EFA\\hr-portal\\frontend";
var vite_config_default = defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": resolve(__vite_injected_original_dirname, "src")
    }
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true
      }
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"]
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    // 显式接受 vendor-element 全量引入的 chunk 体积。
    // 原因：项目使用 Element Plus 全局注册（import ElementPlus from 'element-plus'），
    // 所有组件一次性打包，单 chunk 约 940 KB。
    // 后续可按需引入（unplugin-vue-components）进一步优化。
    chunkSizeWarningLimit: 1e3,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/element-plus")) return "vendor-element";
          if (id.includes("node_modules/echarts")) return "vendor-echarts";
          if (id.includes("node_modules/@vueuse")) return "vendor-vueuse";
          if (id.includes("node_modules/vue") || id.includes("node_modules/pinia")) return "vendor-vue";
          if (id.includes("node_modules/@vueflow") || id.includes("node_modules/@vue-flow")) return "vendor-vueflow";
          if (id.includes("views/report/ReportDesigner")) return "report-designer";
        }
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFxBSVx1OTg3OVx1NzZFRVxcXFxIUlx1NjNEMFx1NjU0OFx1NURFNVx1NTE3N1x1NjQyRFx1NUVGQVxcXFxoci1wb3J0YWxcXFxcZnJvbnRlbmRcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkQ6XFxcXEFJXHU5ODc5XHU3NkVFXFxcXEhSXHU2M0QwXHU2NTQ4XHU1REU1XHU1MTc3XHU2NDJEXHU1RUZBXFxcXGhyLXBvcnRhbFxcXFxmcm9udGVuZFxcXFx2aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vRDovQUklRTklQTElQjklRTclOUIlQUUvSFIlRTYlOEYlOTAlRTYlOTUlODglRTUlQjclQTUlRTUlODUlQjclRTYlOTAlQUQlRTUlQkIlQkEvaHItcG9ydGFsL2Zyb250ZW5kL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSdcclxuaW1wb3J0IHZ1ZSBmcm9tICdAdml0ZWpzL3BsdWdpbi12dWUnXHJcbmltcG9ydCB7IHJlc29sdmUgfSBmcm9tICdwYXRoJ1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcclxuICBwbHVnaW5zOiBbdnVlKCldLFxyXG4gIHJlc29sdmU6IHtcclxuICAgIGFsaWFzOiB7XHJcbiAgICAgICdAJzogcmVzb2x2ZShfX2Rpcm5hbWUsICdzcmMnKSxcclxuICAgIH0sXHJcbiAgfSxcclxuICBzZXJ2ZXI6IHtcclxuICAgIGhvc3Q6ICcwLjAuMC4wJyxcclxuICAgIHBvcnQ6IDUxNzMsXHJcbiAgICBwcm94eToge1xyXG4gICAgICAnL2FwaSc6IHtcclxuICAgICAgICB0YXJnZXQ6ICdodHRwOi8vbG9jYWxob3N0OjgwMDAnLFxyXG4gICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcclxuICAgICAgfSxcclxuICAgIH0sXHJcbiAgfSxcclxuICB0ZXN0OiB7XHJcbiAgICBlbnZpcm9ubWVudDogJ2pzZG9tJyxcclxuICAgIGdsb2JhbHM6IHRydWUsXHJcbiAgICBzZXR1cEZpbGVzOiBbJy4vc3JjL3Rlc3Qtc2V0dXAudHMnXSxcclxuICB9LFxyXG4gIGJ1aWxkOiB7XHJcbiAgICBvdXREaXI6ICdkaXN0JyxcclxuICAgIHNvdXJjZW1hcDogZmFsc2UsXHJcbiAgICAvLyBcdTY2M0VcdTVGMEZcdTYzQTVcdTUzRDcgdmVuZG9yLWVsZW1lbnQgXHU1MTY4XHU5MUNGXHU1RjE1XHU1MTY1XHU3Njg0IGNodW5rIFx1NEY1M1x1NzlFRlx1MzAwMlxyXG4gICAgLy8gXHU1MzlGXHU1NkUwXHVGRjFBXHU5ODc5XHU3NkVFXHU0RjdGXHU3NTI4IEVsZW1lbnQgUGx1cyBcdTUxNjhcdTVDNDBcdTZDRThcdTUxOENcdUZGMDhpbXBvcnQgRWxlbWVudFBsdXMgZnJvbSAnZWxlbWVudC1wbHVzJ1x1RkYwOVx1RkYwQ1xyXG4gICAgLy8gXHU2MjQwXHU2NzA5XHU3RUM0XHU0RUY2XHU0RTAwXHU2QjIxXHU2MDI3XHU2MjUzXHU1MzA1XHVGRjBDXHU1MzU1IGNodW5rIFx1N0VBNiA5NDBcdTIwMkZLQlx1MzAwMlxyXG4gICAgLy8gXHU1NDBFXHU3RUVEXHU1M0VGXHU2MzA5XHU5NzAwXHU1RjE1XHU1MTY1XHVGRjA4dW5wbHVnaW4tdnVlLWNvbXBvbmVudHNcdUZGMDlcdThGREJcdTRFMDBcdTZCNjVcdTRGMThcdTUzMTZcdTMwMDJcclxuICAgIGNodW5rU2l6ZVdhcm5pbmdMaW1pdDogMTAwMCxcclxuICAgIHJvbGx1cE9wdGlvbnM6IHtcclxuICAgICAgb3V0cHV0OiB7XHJcbiAgICAgICAgbWFudWFsQ2h1bmtzKGlkKSB7XHJcbiAgICAgICAgICAvLyB2ZW5kb3IgXHUyMDE0IFx1N0IyQ1x1NEUwOVx1NjVCOVx1NUU5M1x1NjMwOVx1Njg0Nlx1NjdCNi9VSS9cdTVERTVcdTUxNzdcdTYyQzZcdTUzMDVcdUZGMENcdTkwN0ZcdTUxNERcdTVGQUFcdTczQUZcdTVGMTVcdTc1MjhcclxuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnbm9kZV9tb2R1bGVzL2VsZW1lbnQtcGx1cycpKSByZXR1cm4gJ3ZlbmRvci1lbGVtZW50J1xyXG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdub2RlX21vZHVsZXMvZWNoYXJ0cycpKSByZXR1cm4gJ3ZlbmRvci1lY2hhcnRzJ1xyXG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdub2RlX21vZHVsZXMvQHZ1ZXVzZScpKSByZXR1cm4gJ3ZlbmRvci12dWV1c2UnXHJcbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ25vZGVfbW9kdWxlcy92dWUnKSB8fCBpZC5pbmNsdWRlcygnbm9kZV9tb2R1bGVzL3BpbmlhJykpIHJldHVybiAndmVuZG9yLXZ1ZSdcclxuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnbm9kZV9tb2R1bGVzL0B2dWVmbG93JykgfHwgaWQuaW5jbHVkZXMoJ25vZGVfbW9kdWxlcy9AdnVlLWZsb3cnKSkgcmV0dXJuICd2ZW5kb3ItdnVlZmxvdydcclxuICAgICAgICAgIC8vIFVDUCB2aWV3cyBcdTIwMTQgXHU4REVGXHU3NTMxXHU1REYyXHU1MDVBXHU2MUQyXHU1MkEwXHU4RjdEXHVGRjA4ZHluYW1pYyBpbXBvcnRcdUZGMDlcdUZGMENcdTc1MzEgVml0ZSBcdTgxRUFcdTUyQThcdTYyQzZcdTUzMDVcdUZGMENcclxuICAgICAgICAgIC8vIFx1NEUwRFx1NTA1QSBtYW51YWxDaHVua3NcdUZGMENcdTkwN0ZcdTUxNEQgdGFicy9jb21wb25lbnRzIFx1NEUwRSB2aWV3cyBcdTRFNEJcdTk1RjRcdTc2ODRcdTVGQUFcdTczQUZcdTRGOURcdThENTZcclxuICAgICAgICAgIC8vIG90aGVyIGxhcmdlIHZpZXdzXHJcbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ3ZpZXdzL3JlcG9ydC9SZXBvcnREZXNpZ25lcicpKSByZXR1cm4gJ3JlcG9ydC1kZXNpZ25lcidcclxuICAgICAgICB9LFxyXG4gICAgICB9LFxyXG4gICAgfSxcclxuICB9LFxyXG59KSJdLAogICJtYXBwaW5ncyI6ICI7QUFBcVcsU0FBUyxvQkFBb0I7QUFDbFksT0FBTyxTQUFTO0FBQ2hCLFNBQVMsZUFBZTtBQUZ4QixJQUFNLG1DQUFtQztBQUl6QyxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTLENBQUMsSUFBSSxDQUFDO0FBQUEsRUFDZixTQUFTO0FBQUEsSUFDUCxPQUFPO0FBQUEsTUFDTCxLQUFLLFFBQVEsa0NBQVcsS0FBSztBQUFBLElBQy9CO0FBQUEsRUFDRjtBQUFBLEVBQ0EsUUFBUTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLE1BQ0wsUUFBUTtBQUFBLFFBQ04sUUFBUTtBQUFBLFFBQ1IsY0FBYztBQUFBLE1BQ2hCO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQSxFQUNBLE1BQU07QUFBQSxJQUNKLGFBQWE7QUFBQSxJQUNiLFNBQVM7QUFBQSxJQUNULFlBQVksQ0FBQyxxQkFBcUI7QUFBQSxFQUNwQztBQUFBLEVBQ0EsT0FBTztBQUFBLElBQ0wsUUFBUTtBQUFBLElBQ1IsV0FBVztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsSUFLWCx1QkFBdUI7QUFBQSxJQUN2QixlQUFlO0FBQUEsTUFDYixRQUFRO0FBQUEsUUFDTixhQUFhLElBQUk7QUFFZixjQUFJLEdBQUcsU0FBUywyQkFBMkIsRUFBRyxRQUFPO0FBQ3JELGNBQUksR0FBRyxTQUFTLHNCQUFzQixFQUFHLFFBQU87QUFDaEQsY0FBSSxHQUFHLFNBQVMsc0JBQXNCLEVBQUcsUUFBTztBQUNoRCxjQUFJLEdBQUcsU0FBUyxrQkFBa0IsS0FBSyxHQUFHLFNBQVMsb0JBQW9CLEVBQUcsUUFBTztBQUNqRixjQUFJLEdBQUcsU0FBUyx1QkFBdUIsS0FBSyxHQUFHLFNBQVMsd0JBQXdCLEVBQUcsUUFBTztBQUkxRixjQUFJLEdBQUcsU0FBUyw2QkFBNkIsRUFBRyxRQUFPO0FBQUEsUUFDekQ7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
