<template>
  <div v-if="total || loading || error" class="audience-conflicts">
    <PerformancePromptNotice v-if="total" type="error" multiline role="alert">
      <div class="audience-conflicts__content">
        <div>有 <PerformanceTextButton :label="String(total)" aria-label="查看重复人员" :disabled="loading || removing || disabled" @click="emit('view')" /> 人已在本周期的其他项目进行绩效评估，需移除他们。</div>
        <PerformanceTextButton label="移除人员" :disabled="loading || removing || disabled" @click="emit('remove')" />
      </div>
    </PerformancePromptNotice>
    <PerformancePromptNotice v-if="error" type="error" multiline role="alert">
      {{ error }} <PerformanceTextButton label="重试检查" :disabled="loading || removing || disabled" @click="emit('retry')" />
    </PerformancePromptNotice>
    <p v-else-if="loading && !total" class="audience-conflicts__loading" role="status">正在检查重复人员…</p>
  </div>
</template>
<script setup lang="ts">
import PerformancePromptNotice from './PerformancePromptNotice.vue'
import PerformanceTextButton from './PerformanceTextButton.vue'
defineProps<{ total: number; loading: boolean; removing: boolean; error: string; disabled: boolean }>()
const emit = defineEmits<{ view: []; remove: []; retry: [] }>()
</script>
<style scoped>
.audience-conflicts { margin-bottom: var(--spacing-4); }
.audience-conflicts__content { display: flex; flex-direction: column; align-items: flex-start; }
.audience-conflicts__loading { margin: 0; color: var(--color-text-secondary); font-size: var(--font-size-md); line-height: var(--performance-input-line-height); }
</style>
