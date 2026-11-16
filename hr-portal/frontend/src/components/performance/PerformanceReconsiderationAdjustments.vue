<template>
  <div class="reconsideration-adjustments">
    <section v-for="group in groups" :key="group.key" class="reconsideration-adjustments__group">
      <PerformanceAssessmentPreviewHeader :name="group.name" heading-tag="h3" />
      <div v-for="(adjustment, index) in group.items" :key="`${adjustment.field_id}:${adjustment.instance_index ?? index}`" class="reconsideration-adjustments__field">
        <div v-if="adjustment.field_type === 'rating' || adjustment.field_type === 'single_select'" class="reconsideration-adjustments__rating" :aria-label="adjustment.field_label">
          <PerformanceRatingTag :label="option(adjustment, adjustment.before).label" :color="option(adjustment, adjustment.before).color" :foreground="option(adjustment, adjustment.before).foreground" />
          <svg class="reconsideration-adjustments__arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21.707 11.293a1 1 0 0 1 0 1.414l-7 7a1 1 0 0 1-1.414-1.414L18.586 13H2a1 1 0 1 1 0-2h16.586l-5.293-5.293a1 1 0 0 1 1.414-1.414l7 7Z" fill="currentColor" /></svg>
          <PerformanceRatingTag :label="option(adjustment, adjustment.after).label" :color="option(adjustment, adjustment.after).color" :foreground="option(adjustment, adjustment.after).foreground" />
        </div>
        <div v-else class="reconsideration-adjustments__text" :aria-label="adjustment.field_label"><template v-for="(part, partIndex) in differences(adjustment)" :key="partIndex"><del v-if="part.kind === 'removed'">{{ part.text }}</del><ins v-else-if="part.kind === 'added'">{{ part.text }}</ins><span v-else>{{ part.text }}</span></template></div>
      </div>
    </section>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import type { PerformanceReconsiderationAdjustment, PerformanceTemplateSection } from '@/api/performance'
import PerformanceAssessmentPreviewHeader from './PerformanceAssessmentPreviewHeader.vue'
import PerformanceRatingTag from './PerformanceRatingTag.vue'
const props = defineProps<{ adjustments: PerformanceReconsiderationAdjustment[]; sections: PerformanceTemplateSection[] }>()
const groups = computed(() => {
  const groups = new Map<string, { key: string; name: string; items: PerformanceReconsiderationAdjustment[] }>()
  for (const adjustment of props.adjustments) {
    const key = `${adjustment.section_id}:${adjustment.instance_index ?? ''}`
    if (!groups.has(key)) groups.set(key, { key, name: `${adjustment.section_name}${adjustment.instance_index != null ? ` ${adjustment.instance_index + 1}` : ''}`, items: [] })
    groups.get(key)!.items.push(adjustment)
  }
  return [...groups.values()].map(group => ({ ...group, items: [...group.items].reverse() }))
})
function option(adjustment: PerformanceReconsiderationAdjustment, value: unknown) {
  const field = props.sections.find(section => section.id === adjustment.section_id)?.fields.find(field => field.id === adjustment.field_id)
  const configured = field?.options?.find(option => option.id === String(value))
  const fallback = adjustment.options?.find(option => option.id === String(value))
  return { ...configured, label: value === '__unknown__' ? '不了解' : configured?.code || configured?.label || fallback?.label || String(value ?? '—') }
}
function text(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'object') {
    const tags = Array.isArray(value) ? value : (value as { tags?: string[] }).tags
    if (tags) return tags.map(String).join('、')
  }
  const element = document.createElement('div')
  element.innerHTML = String(value)
  element.querySelectorAll('script,style,iframe,object,embed').forEach(node => node.remove())
  element.querySelectorAll('br').forEach(node => node.replaceWith('\n'))
  element.querySelectorAll('p,div,li').forEach(node => node.append('\n'))
  return (element.textContent || '').replace(/​/g, '').replace(/\n+$/, '')
}
type Difference = { kind: 'same' | 'removed' | 'added'; text: string }
function differences(adjustment: PerformanceReconsiderationAdjustment): Difference[] {
  const before = Array.from(text(adjustment.before)), after = Array.from(text(adjustment.after))
  let prefix = 0, suffix = 0
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++
  while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - suffix - 1] === after[after.length - suffix - 1]) suffix++
  const old = before.slice(prefix, before.length - suffix), next = after.slice(prefix, after.length - suffix)
  const parts: Difference[] = []
  function append(kind: Difference['kind'], value: string) {
    if (!value) return
    if (parts.at(-1)?.kind === kind) parts.at(-1)!.text += value
    else parts.push({ kind, text: value })
  }
  append('same', before.slice(0, prefix).join(''))
  if (old.length * next.length <= 250000) {
    const width = next.length + 1
    const lengths = new Uint32Array((old.length + 1) * width)
    for (let i = old.length - 1; i >= 0; i--) for (let j = next.length - 1; j >= 0; j--) lengths[i * width + j] = old[i] === next[j] ? lengths[(i + 1) * width + j + 1] + 1 : Math.max(lengths[(i + 1) * width + j], lengths[i * width + j + 1])
    let i = 0, j = 0
    while (i < old.length || j < next.length) {
      if (i < old.length && j < next.length && old[i] === next[j]) { append('same', old[i++]); j++ }
      else if (i < old.length && (j === next.length || lengths[(i + 1) * width + j] >= lengths[i * width + j + 1])) append('removed', old[i++])
      else append('added', next[j++])
    }
  } else { append('removed', old.join('')); append('added', next.join('')) }
  append('same', suffix ? before.slice(-suffix).join('') : '')
  return parts
}
</script>
<style scoped>
.reconsideration-adjustments__group{display:flex;min-width:0;flex-direction:column;padding:16px;border-radius:4px;background:var(--perf-n-100,#f5f6f7)}.reconsideration-adjustments__group+.reconsideration-adjustments__group{margin-top:32px}.reconsideration-adjustments__group :deep(.performance-assessment-preview-header){margin-bottom:4px;padding-left:10px}.reconsideration-adjustments__group :deep(.performance-assessment-preview-header::before){top:4px;height:16px}.reconsideration-adjustments__field{min-width:0;padding-top:8px}.reconsideration-adjustments__field+.reconsideration-adjustments__field{margin-top:20px;padding-top:20px;border-top:1px solid var(--perf-n-300,#dee0e3)}.reconsideration-adjustments__text{min-width:0;color:var(--color-text-primary);font:400 14px/24px var(--font-sans);white-space:pre-wrap;overflow-wrap:anywhere}.reconsideration-adjustments__text del{color:#621c18;background:rgba(245,74,69,.1);text-decoration:line-through}.reconsideration-adjustments__text ins{background:rgba(52,199,36,.1);text-decoration:none}.reconsideration-adjustments__rating{display:flex;min-width:0;align-items:center;min-height:24px}.reconsideration-adjustments__arrow{flex:none;margin:0 12px;color:var(--perf-n-600,#646a73)}
</style>
