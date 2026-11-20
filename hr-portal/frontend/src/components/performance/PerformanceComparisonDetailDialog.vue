<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { PerformanceComparisonMatch } from '@/api/performance'
import PerformancePopover from './PerformancePopover.vue'
import PerformanceSelectTag from './PerformanceSelectTag.vue'
import PerformanceRatingTag from './PerformanceRatingTag.vue'

const props = defineProps<{ matches: PerformanceComparisonMatch[]; anchor: HTMLElement }>()
const emit = defineEmits<{ close: [] }>()
const panel = ref<HTMLElement | null>(null)
const records = computed(() => {
  const result = new Map<string, { reviewer: PerformanceComparisonMatch['first_reviewer']; nodeName: string; items: Array<{ key: string; label: string; rating: PerformanceComparisonMatch['first_rating'] }> }>()
  for (const match of props.matches) {
    for (const side of ['first', 'second'] as const) {
      const key = `${side}:${match[`${side}_task_id`]}:${match[`${side}_version`]}`
      let record = result.get(key)
      if (!record) {
        record = { reviewer: match[`${side}_reviewer`], nodeName: match[`${side}_node_name`] || '评估环节', items: [] }
        result.set(key, record)
      }
      const itemKey = `${match.content_id}:${match.item_id}`
      if (!record.items.some(item => item.key === itemKey)) record.items.push({ key: itemKey, label: match.label || '评估项', rating: match[`${side}_rating`] })
    }
  }
  return [...result.values()]
})
function close(restoreFocus = false) {
  if (restoreFocus) props.anchor.focus()
  emit('close')
}
function outside(event: MouseEvent) {
  const target = event.target as Node
  if (!props.anchor.contains(target) && !panel.value?.contains(target)) close()
}
onMounted(async () => {
  document.addEventListener('mousedown', outside)
  await nextTick()
  panel.value?.focus()
})
onBeforeUnmount(() => document.removeEventListener('mousedown', outside))
</script>

<template>
  <PerformancePopover :visible="true" :anchor="anchor" width="var(--performance-comparison-detail-width)" align="end" role="dialog" aria-label="评估差异详情" name="comparison-detail-popover" content-class="comparison-detail-popover__content" @close="close(true)">
    <div ref="panel" class="comparison-detail__records" tabindex="-1">
      <section v-for="(record, index) in records" :key="index" class="comparison-detail__record">
        <div class="comparison-detail__reviewer">
          <PerformanceSelectTag v-if="record.reviewer?.display_name" class="comparison-detail__person" :label="record.reviewer.display_name" :avatar-url="record.reviewer.avatar_url" :avatar-fallback="record.reviewer.display_name.slice(-1)" :closable="false" />
          <span v-else class="comparison-detail__missing-person">评估人信息不可用</span>
          <span class="comparison-detail__node" :title="record.nodeName">{{ record.nodeName }}</span>
        </div>
        <div class="comparison-detail__items">
          <div v-for="item in record.items" :key="item.key" class="comparison-detail__item">
            <span class="comparison-detail__label" :title="item.label">{{ item.label }}</span>
            <PerformanceRatingTag v-if="item.rating?.label" class="comparison-detail__rating" :label="item.rating.code || item.rating.label" :color="item.rating.color" :foreground="item.rating.foreground" />
            <span v-else>评级信息不可用</span>
          </div>
        </div>
      </section>
    </div>
  </PerformancePopover>
</template>

<style scoped>
:global(.performance-popover.comparison-detail-popover>.comparison-detail-popover__content){padding:var(--performance-comparison-detail-padding-y) var(--performance-comparison-detail-padding-x)}
.comparison-detail__records{display:flex;flex-direction:column;gap:var(--performance-comparison-detail-group-gap);outline:none}
.comparison-detail__record{display:flex;flex-direction:column;gap:var(--performance-comparison-detail-row-gap);min-width:0}
.comparison-detail__reviewer{display:flex;align-items:center;min-width:0}
.comparison-detail__person{--performance-select-tag-height:var(--performance-comparison-detail-person-height);--performance-select-tag-radius:var(--radius-pill);--performance-select-tag-content-max-width:var(--performance-comparison-detail-person-name-max-width);max-width:var(--performance-comparison-detail-person-max-width);margin:var(--performance-comparison-detail-person-margin-top) var(--spacing-3) var(--performance-comparison-detail-person-margin-bottom) 0;padding:0 var(--performance-member-pill-padding-right) 0 var(--performance-member-pill-padding-left)}
.comparison-detail__person :deep(.performance-select-shell__tag-avatar){width:var(--performance-member-avatar-size-sm);height:var(--performance-member-avatar-size-sm);flex-basis:var(--performance-member-avatar-size-sm)}
.comparison-detail__node{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:var(--color-text-tertiary)}
.comparison-detail__missing-person{margin-right:var(--spacing-3);padding-block:var(--performance-comparison-detail-person-margin-top);color:var(--color-text-tertiary)}
.comparison-detail__items{display:flex;flex-wrap:wrap;gap:var(--spacing-2)}
.comparison-detail__item{display:flex;align-items:center;gap:var(--spacing-1);min-width:0;max-width:100%;color:var(--color-text-tertiary)}
.comparison-detail__label{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.comparison-detail__rating{height:var(--performance-comparison-detail-rating-height);min-width:var(--performance-comparison-detail-rating-min-width);flex-shrink:0;font-size:var(--performance-comparison-detail-rating-font-size)}
</style>
