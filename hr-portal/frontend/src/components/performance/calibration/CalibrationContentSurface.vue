<script setup lang="ts">
import UiSurface from '@/components/ui/UiSurface.vue'
</script>

<template>
  <div class="calibration-content-frame">
    <main class="calibration-content-scroll">
      <UiSurface class="calibration-content-surface" padding="0" min-width="0" radius="all">
        <slot name="heading" />
        <div class="calibration-content-surface__inner"><slot /></div>
      </UiSurface>
    </main>
  </div>
</template>

<style scoped>
.calibration-content-frame { min-width: 0; min-height: 0; height: 100%; padding-bottom: var(--performance-calibration-surface-bottom-gap); box-sizing: border-box; background: var(--performance-calibration-workspace-background); }
.calibration-content-scroll { min-width: 0; min-height: 0; height: 100%; overflow: auto; padding: 0 var(--performance-calibration-content-inset); box-sizing: border-box; background: var(--performance-calibration-workspace-background); }
.calibration-content-surface { min-height: 100%; }
.calibration-content-surface__inner { min-width: 0; padding: 0 var(--performance-calibration-content-inset) var(--performance-calibration-content-inset); }
</style>
