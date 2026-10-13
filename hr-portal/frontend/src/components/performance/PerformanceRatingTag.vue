<template>
  <span class="performance-rating-tag" :style="{ backgroundColor: performanceLevelBackground(color) }" :title="label">
    <span class="rating-tag-label">{{ label }}</span>
  </span>
</template>

<script setup lang="ts">
import { performanceLevelBackground } from './performanceColorOptions'
defineProps<{ label: string; color?: string }>()
</script>

<style scoped>
.performance-rating-tag { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; min-width: 44px; max-width: 100%; height: 24px; padding: 0 10px; border-radius: 9999px; color: #1f2329; font-size: 14px; font-weight: 400; line-height: 22px; text-align: center; vertical-align: top; }
.rating-tag-label { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
</style>
