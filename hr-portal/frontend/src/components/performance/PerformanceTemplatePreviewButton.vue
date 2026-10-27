<script setup lang="ts">
import PerformanceTextButton from './PerformanceTextButton.vue'
defineProps<{ name: string }>()
</script>

<template>
  <span class="template-preview" title="预览暂未开放">
    <PerformanceTextButton :aria-label="`预览${name}（暂未开放）`" disabled>
      <template #icon><svg viewBox="0 0 24 24" fill="none" aria-hidden="true" data-icon="VisibleOutlined"><path d="M11.985 18.5c3.238 0 6.236-2.06 9.015-6.513C18.292 7.55 15.3 5.5 11.985 5.5 8.67 5.5 5.689 7.549 3 11.987c2.76 4.454 5.748 6.513 8.985 6.513ZM1.502 12.89a1.782 1.782 0 0 1 .023-1.838C4.428 6.017 7.915 3.5 11.984 3.5c4.086 0 7.594 2.538 10.523 7.614l.028.048c.296.519.294 1.16-.01 1.675-3.006 5.108-6.52 7.663-10.541 7.663-4.007 0-7.501-2.537-10.482-7.61ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-2a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" fill="currentColor" /></svg></template>
    </PerformanceTextButton>
  </span>
</template>

<style scoped>
.template-preview { display: inline-flex; flex: 0 0 auto; }
</style>
