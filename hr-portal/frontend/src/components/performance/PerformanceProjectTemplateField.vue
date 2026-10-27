<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PerformanceProjectTemplate } from '@/api/performance'
import PerformanceTextButton from './PerformanceTextButton.vue'
import PerformanceTemplatePickerDialog from './PerformanceTemplatePickerDialog.vue'
import PerformanceTemplatePreviewButton from './PerformanceTemplatePreviewButton.vue'

const props = defineProps<{
  modelValue: number | null
  templates: PerformanceProjectTemplate[]
  loading?: boolean
  error?: string
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: number]; retry: [] }>()
const open = ref(false)
const selected = computed(() => props.templates.find(item => item.template_id === props.modelValue))
</script>

<template>
  <section class="project-template-field" aria-labelledby="project-template-title">
    <h2 id="project-template-title">绩效模板</h2>
    <p class="template-description">先选择绩效模板，再根据模板中的评估内容为该项目圈选合适的被评估人</p>
    <div v-if="modelValue" class="selected-template">
      <div class="selected-content">
        <div class="selected-title"><span class="template-name" :title="selected?.name">{{ selected?.name || `模板 #${modelValue}` }}</span><span class="template-tag">绩效评估</span></div>
        <p class="template-description">{{ selected?.description || (loading ? '正在加载绩效模板...' : '暂无描述') }}</p>
      </div>
      <div class="template-actions">
        <PerformanceTemplatePreviewButton :name="selected?.name || '绩效模板'" />
        <PerformanceTextButton aria-label="切换绩效模板" title="切换绩效模板" :disabled="disabled" @click="open = true">
          <template #icon><svg viewBox="0 0 24 24" fill="none" data-icon="SwitchOutlined" aria-hidden="true"><path d="M2.5 7.958c0 .528.428.956.955.956H21.25c.904 0 1.344-1.104.688-1.726L17.18 2.665a.974.974 0 0 0-1.382.028l-.035.037a1.001 1.001 0 0 0 .032 1.403l2.945 2.87H3.455a.956.956 0 0 0-.955.955ZM2.75 15c-.904 0-1.344 1.104-.688 1.726l4.752 4.518a.986.986 0 0 0 1.394-.029l.032-.033a.98.98 0 0 0-.044-1.385L5.26 17H20.5a1 1 0 1 0 0-2H2.75Z" fill="currentColor" /></svg></template>
        </PerformanceTextButton>
      </div>
    </div>
    <div v-else class="template-empty">
      <PerformanceTextButton label="选择绩效模板" :disabled="disabled" @click="open = true"><template #icon><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v18M3 12h18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg></template></PerformanceTextButton>
    </div>
    <p v-if="error" class="template-error" role="alert">{{ error }} <PerformanceTextButton label="重试" @click="emit('retry')" /></p>
    <PerformanceTemplatePickerDialog v-model:open="open" :model-value="modelValue" :templates="templates" :loading="loading" :error="error" @update:model-value="emit('update:modelValue', $event)" @retry="emit('retry')" />
  </section>
</template>

<style scoped>
.project-template-field { padding: var(--spacing-5); border-radius: var(--radius-lg); background: var(--color-bg-card); box-shadow: var(--performance-content-surface-shadow); }
h2 { margin: 0; color: var(--color-text-primary); font-size: var(--font-size-lg); font-weight: 600; line-height: 24px; }
.template-description { margin: 0; color: var(--performance-template-description-color); font-size: var(--font-size-md); font-weight: 400; line-height: 20px; }
h2 + .template-description { line-height: 22px; }
.template-empty { display: flex; justify-content: center; align-items: center; height: 80px; margin-top: var(--spacing-2); border: 1px dashed var(--performance-template-selected-border); border-radius: var(--radius-lg); }
.selected-template { display: flex; align-items: center; min-width: 0; margin-top: var(--spacing-2); padding: var(--spacing-4) var(--spacing-5); border: 1px solid var(--performance-template-selected-border); border-radius: var(--radius-lg); }
.selected-content { flex: 1; min-width: 0; margin-right: var(--spacing-4); }
.selected-title { display: flex; align-items: center; min-width: 0; gap: var(--spacing-2); }
.template-name { overflow: hidden; color: var(--color-text-primary); font-size: var(--font-size-md); font-weight: 600; line-height: 22px; text-overflow: ellipsis; white-space: nowrap; }
.template-tag { flex: 0 0 auto; padding: 0 var(--performance-template-tag-padding-x); border-radius: var(--radius-sm); background: var(--performance-template-tag-background); color: var(--performance-template-tag-text); font-size: var(--font-size-xs); line-height: 20px; }
.template-actions { display: flex; flex: 0 0 auto; align-items: center; gap: var(--spacing-6); }
.template-error { margin: var(--spacing-2) 0 0; color: var(--color-danger); font-size: var(--font-size-md); }
</style>
