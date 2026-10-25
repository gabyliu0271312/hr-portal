<template>
  <div class="performance-prompt-form" :class="`performance-prompt-form--${variant}`">
    <PerformanceFormItem label="标题">
      <input
        class="prompt-input"
        type="text"
        :value="modelValue.title"
        aria-label="标题"
        @input="updateField('title', ($event.target as HTMLInputElement).value)"
      />
    </PerformanceFormItem>

    <PerformanceFormItem label="提示内容" required :invalid="Boolean(invalid && !modelValue.content.trim())" error-message="提示内容为必填">
      <PerformanceTextField
        type="textarea"
        :model-value="modelValue.content"
        :maxlength="2000"
        show-count
        aria-label="提示内容"
        @update:model-value="updateField('content', $event)"
      />
    </PerformanceFormItem>

    <PerformanceFormItem label="颜色" required>
      <PerformancePromptColorPicker :model-value="modelValue.color" @update:model-value="updateField('color', $event)" />
      <PerformanceCheckbox class="prompt-show-icon" :model-value="modelValue.showIcon === true" label="显示icon" @update:model-value="updateField('showIcon', $event)" />
    </PerformanceFormItem>

    <PerformanceFormItem label="适用的被评估人范围" required>
      <div class="prompt-radio-group">
        <label class="prompt-radio">
          <input
            type="radio"
            :name="instanceId"
            value="all"
            :checked="modelValue.scope === 'all'"
            @change="updateField('scope', 'all')"
          />
          <span class="prompt-radio__dot"></span>
          <span>全部成员</span>
        </label>
        <label class="prompt-radio">
          <input
            type="radio"
            :name="instanceId"
            value="cycle"
            :checked="modelValue.scope === 'cycle'"
            @change="updateField('scope', 'cycle')"
          />
          <span class="prompt-radio__dot"></span>
          <span>在周期提示范围中配置具体范围</span>
        </label>
      </div>
    </PerformanceFormItem>
  </div>
</template>

<script setup lang="ts">
import { getCurrentInstance } from 'vue'
import PerformanceFormItem from './PerformanceFormItem.vue'
import PerformanceCheckbox from './PerformanceCheckbox.vue'
import PerformancePromptColorPicker from './PerformancePromptColorPicker.vue'
import PerformanceTextField from './PerformanceTextField.vue'

import type { PerformancePromptValue } from '@/api/performance'
export type { PerformancePromptValue } from '@/api/performance'

const props = withDefaults(defineProps<{
  modelValue: PerformancePromptValue
  invalid?: boolean
  variant?: 'default' | 'inline'
}>(), {
  invalid: false,
  variant: 'default',
})

const instanceId = `performance-prompt-scope-${getCurrentInstance()!.uid}`
const emit = defineEmits<{
  'update:modelValue': [value: PerformancePromptValue]
}>()

function updateField<Key extends keyof PerformancePromptValue>(key: Key, value: PerformancePromptValue[Key]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
</script>

<style scoped>
.performance-prompt-form { min-width: 0; width: 100%; max-width: var(--performance-content-width); }
.prompt-input { width: 100%; min-width: 0; height: var(--performance-control-height); padding: var(--performance-input-padding-y) var(--performance-input-padding-x); box-sizing: border-box; border: 1px solid var(--performance-field-border); border-radius: var(--performance-control-radius); background: var(--color-bg-card); color: var(--color-text-primary); font: inherit; }
.prompt-input:focus { border-color: var(--performance-field-border-focus); outline: 0; box-shadow: var(--performance-field-focus-ring); }
.prompt-radio-group { display: flex; flex-direction: column; gap: var(--spacing-2); }
.prompt-show-icon { margin-top: var(--spacing-2); }
.prompt-radio { position: relative; display: flex; align-items: center; gap: var(--spacing-2); min-height: 22px; color: var(--color-text-primary); line-height: 22px; cursor: pointer; }
.prompt-radio input { position: absolute; width: 16px; height: 16px; margin: 0; opacity: 0; cursor: pointer; }
.prompt-radio__dot { display: block; width: 16px; height: 16px; flex: none; box-sizing: border-box; border: 1px solid var(--color-text-placeholder); border-radius: 50%; }
.prompt-radio input:checked + .prompt-radio__dot { border-color: var(--color-primary-hover); background: var(--color-primary-hover); box-shadow: inset 0 0 0 4px var(--color-bg-card); }
.prompt-radio input:focus-visible + .prompt-radio__dot { box-shadow: inset 0 0 0 4px var(--color-bg-card), var(--performance-button-focus-ring); }
.performance-prompt-form--inline :deep(.performance-form-item) { margin-bottom: var(--performance-input-field-gap); }
</style>
