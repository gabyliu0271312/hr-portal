<template>
  <div class="self-summary-page performance-task-workspace">
    <slot name="header" />
    <slot name="tabs" />
    <div v-if="splitMode" class="task-workspace-layout"><slot name="split" /></div>
    <template v-else>
      <main class="summary-scroll"><slot /></main>
      <slot name="footer" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { usePerformanceIdentityHeartbeat } from '@/composables/usePerformanceIdentityHeartbeat'

defineProps<{ splitMode?: boolean }>()
usePerformanceIdentityHeartbeat()
</script>

<style scoped>
:global(html:has(.performance-task-workspace)){scrollbar-gutter:auto}
.performance-task-workspace{
  display:flex;
  width:100%;
  height:100vh;
  height:100dvh;
  min-width:0;
  min-height:0;
  flex:1;
  flex-direction:column;
  overflow:hidden;
  background:var(--performance-review-page-bg,#f4f5f6);
  color:var(--color-text-primary);
  font-family:var(--font-sans);
}
.summary-scroll{
  display:flex;
  min-width:0;
  min-height:0;
  flex:1;
  flex-direction:column;
  overflow-y:auto;
  overflow-x:hidden;
  padding:12px;
}
.summary-scroll :slotted(*){flex:1 0 auto;min-width:0}
.task-workspace-layout{display:flex;flex:1;min-width:0;min-height:0;overflow:hidden}
@media(max-width:640px){.summary-scroll{padding:12px 16px}}
</style>
