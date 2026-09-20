<template><PerformanceTemplateRenderer mode="readonly" :sections="sections" :answers="answers" /></template>
<script setup lang="ts">
import type { PerformanceTemplateSection } from '@/api/performance'
import PerformanceTemplateRenderer from './PerformanceTemplateRenderer.vue'

defineProps<{ sections: PerformanceTemplateSection[]; answers: Record<string, unknown> }>()
</script>
