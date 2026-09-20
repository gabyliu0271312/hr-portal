<template>
  <label class="performance-assessment-select">
    <span class="field-label">{{ label }}<i v-if="required">*</i></span>
    <div :class="['select-shell', { invalid, open }]">
      <button type="button" role="combobox" :aria-expanded="open" @click="open = !open">
        <span :class="{ placeholder: !selected }">{{ selected?.label || placeholder }}</span>
        <ArrowUp v-if="open" /><ArrowDown v-else />
      </button>
      <div v-if="open" class="option-menu" role="listbox">
        <template v-if="options.length">
          <button
            v-for="option in options"
            :key="option.id"
            type="button"
            role="option"
            :aria-selected="option.id === modelValue"
            :class="{ selected: option.id === modelValue }"
            :aria-disabled="option.disabled ? true : undefined"
            :disabled="option.disabled"
            :title="option.disabled ? (option.disabledReason || defaultDisabledReason) : undefined"
            @click="select(option)"
          >
            <strong>{{ option.label }}</strong>
            <small v-if="option.description">{{ option.description }}</small>
            <em v-if="option.disabled">{{ option.disabledReason || defaultDisabledReason }}</em>
            <Check v-if="option.id === modelValue" class="option-check" aria-hidden="true" />
          </button>
        </template>
        <div v-else class="option-empty">{{ emptyText }}</div>
      </div>
    </div>
    <span v-if="invalid" class="field-error">{{ label === '评估项' ? '评估项为必填' : '此项为必填' }}</span>
  </label>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowDown, ArrowUp, Check } from '@element-plus/icons-vue'

export interface PerformanceAssessmentSelectOption {
  id: string
  label: string
  description?: string
  disabled?: boolean
  disabledReason?: string
}

const props = withDefaults(defineProps<{
  modelValue?: string
  label: string
  required?: boolean
  placeholder?: string
  options?: PerformanceAssessmentSelectOption[]
  invalid?: boolean
  emptyText?: string
}>(), {
  modelValue: '',
  required: false,
  placeholder: '',
  options: () => [],
  invalid: false,
  emptyText: '暂无数据',
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const open = ref(false)
const defaultDisabledReason = '模板中已存在该评估项'
const selected = computed(() => props.options.find((option) => option.id === props.modelValue))

function select(option: PerformanceAssessmentSelectOption) {
  if (option.disabled) return
  emit('update:modelValue', option.id)
  open.value = false
}
</script>

<style scoped>
.performance-assessment-select{display:block}.performance-assessment-select.inside-select{margin:18px 20px}.field-label{display:block;margin-bottom:6px;font-weight:600}.field-label i{margin-left:2px;color:#f54a45;font-style:normal}.select-shell{position:relative;border:1px solid #d0d3d6;border-radius:6px}.select-shell.open{border-color:#3370ff}.select-shell.invalid{border-color:#f54a45}.select-shell>button{display:flex;align-items:center;justify-content:space-between;width:100%;height:30px;padding:4px 11px;border:0;border-radius:6px;background:#fff;font:inherit;text-align:left}.select-shell>button svg{width:14px}.placeholder{color:#8f959e}.option-menu{position:absolute;z-index:10;top:36px;right:-1px;left:-1px;max-height:220px;overflow:auto;padding:4px 0;border:1px solid #dee0e3;border-radius:6px;background:#fff;box-shadow:0 6px 24px rgba(31,35,41,.16)}.option-menu>button{position:relative;display:flex;flex-direction:column;width:100%;min-height:44px;padding:6px 12px;border:0;background:#fff;text-align:left;font:inherit}.option-menu>button:hover:not(:disabled),.option-menu>button.selected{background:#eff0f1}.option-menu>button:disabled{color:#8f959e}.option-menu small{color:#8f959e}.option-menu em{position:absolute;right:10px;top:6px;font-size:12px;font-style:normal}.option-check{position:absolute;right:12px;top:10px;width:16px;color:#1456f0}.option-empty{padding:10px;color:#8f959e;text-align:center}.field-error{display:block;margin-top:2px;color:#f54a45;font-size:13px}
</style>
