<template>
  <div class="app-brand" :class="`app-brand--${theme}`" :aria-label="label">
    <AppIcon :app-key="appKey" class="app-brand__mark" />
    <span class="app-brand__divider" aria-hidden="true"></span>
    <span class="app-brand__name">{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
import AppIcon from './AppIcon.vue'

withDefaults(defineProps<{ appKey: string; label: string; theme?: 'light' | 'dark' }>(), {
  theme: 'light',
})
</script>

<style scoped>
.app-brand { display: inline-flex; align-items: center; gap: 0; margin: 0 8px; white-space: nowrap; }
.app-brand__mark { display: block; width: 28px; height: 28px; }
.app-brand__divider { width: 1px; height: 28px; margin: 0 8px; background: rgba(31, 35, 41, 0.15); }
.app-brand__name { color: #1f2329; font-size: 14px; }
.app-brand--dark .app-brand__divider { background: rgba(255, 255, 255, .55); }
.app-brand--dark .app-brand__name { color: rgba(255, 255, 255, .92); }
</style>
