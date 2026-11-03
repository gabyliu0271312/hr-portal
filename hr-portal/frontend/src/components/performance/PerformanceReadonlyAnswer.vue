<template>
  <div v-if="field.type === 'tag_with_followup'" class="readonly-tag-panel">
    <PerformanceTagRichTextInput :model-value="value" :options="field.options || []" :editable="false" display-only :empty-answer-text="emptyAnswerText">
      <template #answer="{ value: answer }"><div class="readonly-answer rich-answer performance-rich-text-content" v-html="safeHtml(answer || emptyAnswerText)" /></template>
    </PerformanceTagRichTextInput>
  </div>
  <div v-else-if="field.type === 'rating'" class="readonly-rating">
    <PerformanceRatingTag class="readonly-rating-badge" :label="ratingCode" :color="selectedOption?.color" />
    <span class="readonly-rating-label" :style="{ color: ratingForeground }">{{ ratingLabel }}</span>
  </div>
  <div v-else class="readonly-answer rich-answer performance-rich-text-content" v-html="safeHtml(value || emptyAnswerText)" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PerformanceTemplateField } from '@/api/performance'
import PerformanceTagRichTextInput from './PerformanceTagRichTextInput.vue'
import PerformanceRatingTag from './PerformanceRatingTag.vue'
import { performanceLevelForeground } from './performanceColorOptions'

const props = withDefaults(defineProps<{ field: PerformanceTemplateField; value: unknown; emptyAnswerText?: string }>(), { emptyAnswerText: '' })
const selectedOption = computed(() => props.field.options?.find(option => option.id === String(props.value || '')))
const ratingCode = computed(() => props.value === '__unknown__' ? '不了解' : selectedOption.value?.code || selectedOption.value?.label || selectedOption.value?.id || String(props.value || '—'))
const ratingLabel = computed(() => props.value === '__unknown__' || selectedOption.value?.code ? selectedOption.value?.label || '' : selectedOption.value?.description || '')
const ratingForeground = computed(() => selectedOption.value?.color ? performanceLevelForeground(selectedOption.value.color) : '#1f2329')
function safeHtml(value: unknown) {
  const template = document.createElement('template')
  template.innerHTML = String(value || '')
  template.content.querySelectorAll('script,style,iframe,object,embed').forEach(node => node.remove())
  const allowed = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'OL', 'UL', 'LI', 'A', 'P', 'DIV', 'BR', 'SPAN'])
  Array.from(template.content.querySelectorAll('*')).forEach(element => {
    if (!allowed.has(element.tagName)) { element.replaceWith(...Array.from(element.childNodes)); return }
    const classes: Record<string, string[]> = { DIV: ['ace-line', 'list-div', 'list-indent1'], OL: ['list-number1', 'r-list', 'r-list-number'], UL: ['list-bullet1', 'r-list', 'r-list-bullet'] }
    Array.from(element.attributes).forEach(attribute => {
      const { name, value } = attribute
      if (name === 'class' && classes[element.tagName]) {
        const safeClasses = value.split(/\s+/).filter(item => classes[element.tagName].includes(item))
        if (safeClasses.length) element.setAttribute('class', safeClasses.join(' '))
        else element.removeAttribute(name)
      } else if (/^(OL|UL|LI)$/.test(element.tagName) && ['start', 'data-start', 'data-origin-start'].includes(name) && /^[1-9]\d{0,5}$/.test(value)) return
      else if (element.tagName !== 'A' || name !== 'href') element.removeAttribute(name)
    })
    if (element.tagName === 'A') {
      const href = element.getAttribute('href') || ''
      if (!/^(https?:|mailto:)/i.test(href)) element.removeAttribute('href')
      else element.setAttribute('rel', 'noopener noreferrer')
    }
  })
  let previousList: Element | null = null
  let nextStart = 1
  template.content.querySelectorAll('ol').forEach(list => {
    const block = list.parentElement?.tagName === 'DIV' ? list.parentElement : list
    const previousBlock = previousList?.parentElement?.tagName === 'DIV' ? previousList.parentElement : previousList
    const start = Number(list.getAttribute('start')) || (previousBlock && block.previousElementSibling === previousBlock ? nextStart : 1)
    let number = start
    Array.from(list.children).filter(item => item.tagName === 'LI').forEach(item => item.setAttribute('data-start', String(number++)))
    list.setAttribute('start', String(start))
    nextStart = number
    previousList = list
  })
  return template.innerHTML
}
</script>

<style scoped>
.readonly-answer{min-height:0;color:#1f2329;font-size:14px;line-height:var(--performance-rich-text-line-height);white-space:pre-wrap;word-break:break-word}.rich-answer{padding:var(--performance-readonly-answer-padding);box-sizing:border-box;background:var(--performance-review-readonly-surface);border-radius:var(--radius-md)}.rich-answer :deep(a){color:#3370ff}.readonly-rating{display:flex;min-width:0;align-items:center;gap:var(--performance-readonly-field-gap);color:#1f2329;font-size:14px;line-height:22px;white-space:nowrap}.readonly-rating :deep(.performance-rating-tag){flex:0 0 auto;width:auto;min-width:44px;height:24px;padding:0 10px;border-radius:9999px}.readonly-rating-label{overflow:hidden;text-overflow:ellipsis}.readonly-tag-panel{min-width:0;border-radius:var(--radius-md);background:var(--performance-review-readonly-surface)}.readonly-tag-panel .rich-answer{min-height:0;padding:0;background:transparent;border-radius:0}
</style>
