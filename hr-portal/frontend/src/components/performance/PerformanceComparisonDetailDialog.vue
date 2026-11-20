<script setup lang="ts">
import type { PerformanceComparisonMatch } from '@/api/performance'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceRatingTag from './PerformanceRatingTag.vue'
import UiButton from '../ui/UiButton.vue'

defineProps<{ modelValue: boolean; matches: PerformanceComparisonMatch[]; notice: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <PerformanceDialogShell :model-value="modelValue" title="评估差异详情" width="var(--performance-dialog-wide-width)" @update:model-value="emit('update:modelValue', $event)">
    <p class="comparison-detail__notice">{{ notice }}</p>
    <section v-for="(match, index) in matches" :key="index" class="comparison-detail__match" :aria-label="match.label || '评估项'">
      <h3>{{ match.label || '评估项' }}</h3>
      <dl class="comparison-detail__ratings">
        <div>
          <dt>{{ match.first_node_name || '第一评估环节' }}</dt>
          <dd><PerformanceRatingTag v-if="match.first_rating?.label" v-bind="match.first_rating" /><span v-else class="comparison-detail__unavailable">评级信息不可用</span></dd>
        </div>
        <div>
          <dt>{{ match.second_node_name || '第二评估环节' }}</dt>
          <dd><PerformanceRatingTag v-if="match.second_rating?.label" v-bind="match.second_rating" /><span v-else class="comparison-detail__unavailable">评级信息不可用</span></dd>
        </div>
      </dl>
      <p class="comparison-detail__difference">实际相差 {{ match.difference }} 档</p>
    </section>
    <template #footer><div class="comparison-detail__actions"><UiButton variant="primary" @click="emit('update:modelValue', false)">知道了</UiButton></div></template>
  </PerformanceDialogShell>
</template>

<style scoped>
.comparison-detail__notice{margin:0 0 var(--spacing-4);overflow-wrap:anywhere;color:var(--color-text-secondary)}
.comparison-detail__match{padding-block:var(--spacing-4);border-top:var(--ui-control-border-width) solid var(--color-border)}
.comparison-detail__match h3{margin:0 0 var(--spacing-3);font-size:var(--font-size-md);font-weight:var(--performance-item-title-font-weight);overflow-wrap:anywhere}
.comparison-detail__ratings{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--spacing-4);margin:0}
.comparison-detail__ratings dt{margin-bottom:var(--spacing-2);color:var(--color-text-secondary);overflow-wrap:anywhere}
.comparison-detail__ratings dd{margin:0;overflow-wrap:anywhere}
.comparison-detail__unavailable{color:var(--color-text-secondary)}
.comparison-detail__difference{margin:var(--spacing-3) 0 0}
.comparison-detail__actions{display:flex;justify-content:flex-end}
@media(max-width:480px){.comparison-detail__ratings{grid-template-columns:minmax(0,1fr)}}
</style>
