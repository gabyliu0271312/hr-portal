<script setup lang="ts">
import { ref, watch } from 'vue'
import PerformanceCountedTextarea from './PerformanceCountedTextarea.vue'
import PerformanceRequiredLabel from './PerformanceRequiredLabel.vue'
import PerformanceTextField from './PerformanceTextField.vue'
import UiButton from '../ui/UiButton.vue'

const props = withDefaults(defineProps<{
  modelValue: { zh: string; en: string }
  label: string
  required?: boolean
  type?: 'input' | 'textarea'
  maxLength?: number
  placeholder?: string
  inputId?: string
}>(), {
  required: false,
  type: 'input',
  maxLength: undefined,
  placeholder: '',
  inputId: 'performance-bilingual-field',
})

const emit = defineEmits<{ 'update:modelValue': [value: { zh: string; en: string }] }>()

const enVisible = ref(Boolean(props.modelValue.en))
watch(() => props.modelValue.en, value => { if (value) enVisible.value = true })

function setZh(value: string) {
  emit('update:modelValue', { ...props.modelValue, zh: value })
}
function setEn(value: string) {
  emit('update:modelValue', { ...props.modelValue, en: value })
}
</script>

<template>
  <div class="performance-bilingual-field">
    <div class="performance-bilingual-field__label">
      <PerformanceRequiredLabel :label="label" :required="required" />
    </div>
    <PerformanceTextField
      v-if="type === 'input'"
      :model-value="modelValue.zh"
      variant="feishu-input"
      :input-id="inputId"
      :maxlength="maxLength"
      :placeholder="placeholder"
      @update:model-value="setZh"
    >
      <template #suffix><span class="language-tag">中文</span></template>
    </PerformanceTextField>
    <PerformanceCountedTextarea
      v-else
      :model-value="modelValue.zh"
      hide-label
      :label="label"
      :max-length="maxLength"
      :input-id="inputId"
      language="中文"
      show-language-and-count
      @update:model-value="setZh"
    />
    <template v-if="enVisible">
      <PerformanceTextField
        v-if="type === 'input'"
        :model-value="modelValue.en"
        variant="feishu-input"
        :input-id="`${inputId}-en`"
        :maxlength="maxLength"
        :placeholder="placeholder"
        @update:model-value="setEn"
      >
        <template #suffix><span class="language-tag">英文</span></template>
      </PerformanceTextField>
      <PerformanceCountedTextarea
        v-else
        :model-value="modelValue.en"
        hide-label
        :label="label"
        :max-length="maxLength"
        :input-id="`${inputId}-en`"
        language="英文"
        show-language-and-count
        @update:model-value="setEn"
      />
    </template>
    <UiButton v-if="!enVisible" class="performance-bilingual-field__add" variant="text" type="button" @click="enVisible = true">添加英文</UiButton>
  </div>
</template>

<style scoped>
.performance-bilingual-field { display: block; margin-bottom: var(--performance-input-field-gap); }
.performance-bilingual-field__label { display: block; margin-bottom: var(--performance-input-label-gap); font-weight: 600; }
.language-tag { display: inline-flex; align-items: center; padding: 0 var(--performance-language-tag-padding-inline); border-radius: var(--radius-sm); background: var(--color-surface-disabled); color: var(--color-text-secondary); font-size: var(--font-size-xs); line-height: var(--performance-language-tag-height); white-space: nowrap; }
.performance-bilingual-field__add { min-width: 0; padding-inline: var(--spacing-1); }
</style>
