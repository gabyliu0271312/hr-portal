<script setup lang="ts">
import { ref, watch } from 'vue'
import PerformanceTextField from './PerformanceTextField.vue'
import PerformanceRequiredLabel from './PerformanceRequiredLabel.vue'
import UiButton from '../ui/UiButton.vue'
import AddOutlinedIcon from './AddOutlinedIcon.vue'

const props = withDefaults(defineProps<{
  modelValue: string
  english: string
  label: string
  required?: boolean
  allowEnglish?: boolean
  multiline?: boolean
  maxlength?: number
  disabled?: boolean
  error?: string
  englishError?: string
}>(), { required: false, allowEnglish: true, multiline: false, disabled: false, error: '', englishError: '' })
const emit = defineEmits<{ 'update:modelValue': [value: string]; 'update:english': [value: string] }>()
const englishVisible = ref(Boolean(props.english))
watch(() => props.english, value => { if (value) englishVisible.value = true })
</script>

<template>
  <div class="localized-field">
    <div class="localized-field__label"><PerformanceRequiredLabel :label="label" :required="required" /></div>
    <div v-for="language in (englishVisible ? ['zh', 'en'] : ['zh'])" :key="language" class="localized-field__row" :class="{ 'is-invalid': language === 'zh' ? error : englishError, 'is-disabled': disabled }">
      <PerformanceTextField :model-value="language === 'zh' ? modelValue : english" :aria-label="`${label}（${language === 'zh' ? '中文' : '英文'}）`" :type="multiline ? 'textarea' : 'input'" :variant="multiline ? 'default' : 'feishu-input'" :show-count="multiline" :maxlength="maxlength" :disabled="disabled" :invalid="Boolean(language === 'zh' ? error : englishError)" @update:model-value="language === 'zh' ? emit('update:modelValue', $event) : emit('update:english', $event)">
        <template #suffix><span class="language-tag">{{ language === 'zh' ? '中文' : '英文' }}</span></template>
      </PerformanceTextField>
      <span v-if="multiline" class="localized-field__language">{{ language === 'zh' ? '中文' : '英文' }}</span>
      <span v-if="language === 'zh' ? error : englishError" class="localized-field__error" role="alert">{{ language === 'zh' ? error : englishError }}</span>
    </div>
    <UiButton v-if="allowEnglish && !englishVisible" class="localized-field__add" variant="text" :disabled="disabled" :aria-label="`${label}添加英文`" @click="englishVisible = true"><AddOutlinedIcon />添加英文</UiButton>
  </div>
</template>

<style scoped>
.localized-field { margin-bottom: var(--performance-workbench-editor-field-gap); min-width: 0; }
.localized-field__label { margin-bottom: var(--spacing-2); color: var(--color-text-primary); font-size: var(--font-size-md); font-weight: 600; line-height: 22px; }
.localized-field__row { position: relative; min-width: 0; }
.localized-field__row + .localized-field__row { margin-top: var(--spacing-2); }
.language-tag, .localized-field__language { padding: 0 6px; border-radius: var(--radius-sm); background: var(--performance-workbench-editor-language-tag-bg); color: var(--performance-workbench-editor-language-tag-color); font-size: var(--font-size-xs); line-height: 20px; white-space: nowrap; }
.localized-field__language { position: absolute; top: 6px; right: 8px; pointer-events: none; }
.localized-field__row:has(.localized-field__language) :deep(textarea) { padding-right: 56px; }
.localized-field__row :deep(.feishu-input-wrap:hover) { border-color: var(--performance-field-border-focus); }
.localized-field__row.is-invalid :deep(.feishu-input-wrap) { border-color: var(--performance-field-border-invalid); }
.localized-field__row.is-disabled :deep(.feishu-input-wrap) { background: var(--performance-field-disabled-background); cursor: not-allowed; }
.localized-field__add { margin-top: var(--spacing-2); height: 22px; }
.localized-field__add :deep(svg) { width: 14px; height: 14px; margin-right: 4px; }
.localized-field__error { display: block; margin-top: 4px; color: var(--color-text-danger-strong); font-size: var(--font-size-sm); line-height: 20px; }
</style>
