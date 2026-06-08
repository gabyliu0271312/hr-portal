/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_COST_ALLOCATION_APP_URL?: string
  readonly VITE_COST_ALLOCATION_ADMIN_URL?: string
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
