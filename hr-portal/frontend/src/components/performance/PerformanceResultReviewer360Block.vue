<template>
  <section class="pr360-block" :aria-label="title">
    <div class="pr360-head">
      <h3 class="pr360-title">{{ title }}</h3>
      <UiButton v-if="visibleContents.length" variant="text" size="small" class="pr360-toggle" :aria-expanded="allExpanded" @click="toggleAll">
        {{ allExpanded ? '收起详情' : '展开详情' }}
      </UiButton>
    </div>
    <p v-if="!visibleContents.length" class="pr360-empty">暂无可查看内容</p>
    <div v-for="content in visibleContents" :key="content.task_id" class="pr360-reviewer">
      <div class="pr360-comment">
        <button type="button" class="pr360-comment__toggle" :aria-expanded="isExpanded(content.task_id)" :aria-label="`${isExpanded(content.task_id) ? '收起' : '展开'}${reviewerName(content)}的反馈`" @click="toggleReviewer(content.task_id)">
          <svg v-if="isExpanded(content.task_id)" width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M11.22 18.46a1 1 0 0 0 1.56 0l8.305-10.334a1 1 0 0 0-.78-1.626H3.696a1 1 0 0 0-.78 1.626L11.22 18.46Z" fill="currentColor"/></svg>
          <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18.627 11.22a1 1 0 0 1 0 1.56L8.291 21.084a1 1 0 0 1-1.626-.78V3.696a1 1 0 0 1 1.626-.78l10.335 8.305Z" fill="currentColor"/></svg>
        </button>
        <PerformanceMemberIdentity :display-name="reviewerName(content)" size="sm" />
      </div>
      <div v-if="isExpanded(content.task_id)" class="pr360-items">
        <div v-for="section in content.form_schema" :key="section.id" class="pr360-section">
          <div v-if="(!section.hide_name && section.name) || section.description" class="pr360-section__header">
            <div v-if="!section.hide_name && section.name" class="pr360-section__title">{{ section.name }}</div>
            <div v-if="section.description" class="pr360-section__description">{{ section.description }}</div>
          </div>
          <PerformanceTemplateRenderer mode="readonly" :show-header="false" :sections="[section]" :answers="content.answers" />
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PerformanceResultContent } from '@/api/performance'
import UiButton from '@/components/ui/UiButton.vue'
import PerformanceMemberIdentity from './PerformanceMemberIdentity.vue'
import PerformanceTemplateRenderer from './PerformanceTemplateRenderer.vue'

const props = withDefaults(defineProps<{
  title?: string
  contents?: PerformanceResultContent[]
}>(), { title: '360°反馈（自愿评估）', contents: () => [] })

const expandedIds = ref<number[]>([])
const visibleContents = computed(() => props.contents.filter(content => content.form_schema.some(section =>
  section.elements ? section.elements.some(element => element.kind === 'field'
    ? section.fields.some(field => field.id === element.id)
    : element.prompt.allowView !== false && !element.prompt.onlyWhenFilling) : section.fields.length > 0,
)))
const allExpanded = computed(() => visibleContents.value.length > 0 && visibleContents.value.every(content => isExpanded(content.task_id)))
function reviewerName(content: PerformanceResultContent) { return content.reviewer?.display_name || content.reviewer?.employee_no || '评估人' }
function isExpanded(id: number) { return expandedIds.value.includes(id) }
function toggleReviewer(id: number) { expandedIds.value = isExpanded(id) ? expandedIds.value.filter(value => value !== id) : [...expandedIds.value, id] }
function toggleAll() { expandedIds.value = allExpanded.value ? [] : visibleContents.value.map(content => content.task_id) }
watch(() => props.contents, () => { expandedIds.value = [] })
</script>

<style scoped>
.pr360-block{min-width:0;color:var(--color-text-primary);font:400 var(--font-size-md)/22px var(--font-sans)}
.pr360-head{display:flex;align-items:center;justify-content:space-between;gap:var(--spacing-3);padding:var(--spacing-3) 0}
.pr360-title{min-width:0;margin:0;font-size:20px;font-weight:600;line-height:30px;overflow-wrap:anywhere}
.pr360-toggle{flex:none}
.pr360-reviewer + .pr360-reviewer{margin-top:var(--spacing-2)}
.pr360-comment{display:flex;align-items:center;gap:var(--spacing-2);min-height:48px;padding:var(--spacing-2);box-sizing:border-box}
.pr360-comment__toggle{display:grid;place-items:center;flex:none;width:20px;height:20px;padding:0;border:0;border-radius:var(--radius-md);background:transparent;color:var(--color-text-secondary);cursor:pointer}
.pr360-comment__toggle:hover{background:var(--performance-icon-button-hover-background)}
.pr360-comment__toggle:focus-visible{outline:0;box-shadow:var(--performance-button-focus-ring)}
.pr360-items{box-sizing:border-box;padding:var(--spacing-4);border-radius:var(--radius-sm);background:var(--performance-review-readonly-surface)}
.pr360-section + .pr360-section{margin-top:var(--spacing-4)}
.pr360-section__header{margin-bottom:var(--spacing-3)}
.pr360-section__title{font-weight:600;line-height:24px}
.pr360-section__description{color:var(--color-text-secondary);white-space:pre-wrap;overflow-wrap:anywhere}
.pr360-empty{margin:var(--spacing-2) 0;color:var(--color-text-secondary)}
</style>
