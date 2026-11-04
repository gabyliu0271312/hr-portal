<template>
  <div class="performance-single-select" role="radiogroup" :aria-label="ariaLabel" :class="{ 'performance-single-select--invalid': invalid }">
    <label
      v-for="option in options"
      :key="option.id"
      class="performance-single-select__option"
      :class="{ 'performance-single-select__option--checked': String(modelValue || '') === option.id }"
    >
      <input
        class="performance-single-select__input"
        type="radio"
        :name="groupName"
        :value="option.id"
        :checked="String(modelValue || '') === option.id"
        :disabled="!interactive"
        @change="interactive && $emit('update:modelValue', option.id)"
      >
      <span class="performance-single-select__box" aria-hidden="true"><span class="performance-single-select__dot"></span></span>
      <span class="performance-single-select__label">{{ option.label }}</span>
    </label>
  </div>
</template>

<script setup lang="ts">
import type { PerformanceTemplateOption } from '@/api/performance'

const props = withDefaults(defineProps<{
  modelValue?: string
  options?: PerformanceTemplateOption[]
  interactive?: boolean
  invalid?: boolean
  ariaLabel?: string
}>(), { modelValue: '', options: () => [], interactive: false, invalid: false, ariaLabel: '' })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
/* 同一个 radiogroup 内 name 必须一致，不同实例之间必须不同，否则浏览器按 name 分组会互相取消选中 */
let uidSeed = 0
const groupName = `performance-single-select-${++uidSeed}-${Math.random().toString(36).slice(2, 8)}`
</script>

<style scoped>
/* REA 实测（结果复议处理 / 是否保持复议前结果）：
   选项行 22 高、单选盒 16×16 居中含 1px #8f959e 边框（选中填充 #1456f0）、盒与文案距 8、选项间距 24。
   单选盒内白点 6×6 距盒左上各 5px。 */
.performance-single-select { display: flex; align-items: center; flex-wrap: wrap; gap: 0 24px; min-height: 22px; }
.performance-single-select__option { display: inline-flex; align-items: center; height: 22px; gap: 8px; cursor: pointer; }
.performance-single-select__input { position: absolute; width: 0; height: 0; margin: 0; padding: 0; opacity: 0; pointer-events: none; }
.performance-single-select__box { position: relative; display: block; flex: none; width: 16px; height: 16px; box-sizing: border-box; border: 1px solid #8f959e; border-radius: 9999px; background: #fff; transition: background-color .1s, border-color .1s; }
.performance-single-select__dot { position: absolute; left: 4px; top: 4px; width: 6px; height: 6px; border-radius: 9999px; background: #fff; transform: scale(0); transition: transform .1s; }
.performance-single-select__option--checked .performance-single-select__box { border-color: #1456f0; background: #1456f0; }
.performance-single-select__option--checked .performance-single-select__dot { transform: scale(1); }
.performance-single-select__label { font-family: inherit; font-size: 14px; line-height: 22px; color: #1f2329; white-space: nowrap; }
.performance-single-select--invalid .performance-single-select__box { border-color: #f54a45; }
</style>
