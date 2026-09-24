<template>
  <div class="performance-assessment-method-header">
    <div>
      <div class="performance-assessment-method-header__title">{{ title }}</div>
      <div v-if="description" class="performance-assessment-method-header__description">{{ description }}</div>
      <a class="performance-assessment-method-header__help" :href="helpHref" target="_blank" rel="noreferrer">查看使用说明</a>
    </div>
    <PerformanceSwitch
      class="performance-assessment-method-header__switch"
      :model-value="modelValue"
      :aria-label="`${title}开关`"
      :disabled="disabled"
      :instant="instant"
      @update:model-value="$emit('update:modelValue', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import PerformanceSwitch from './PerformanceSwitch.vue'

defineProps<{
  title: string
  description?: string
  helpHref: string
  modelValue: boolean
  disabled?: boolean
  instant?: boolean
}>()

defineEmits<{ (event: 'update:modelValue', value: boolean): void }>()
</script>

<style scoped>
.performance-assessment-method-header{display:flex;align-items:center;justify-content:space-between;gap:30px;min-height:46px}
.performance-assessment-method-header__title{font-size:16px;font-weight:600;line-height:24px;color:#1f2329}
.performance-assessment-method-header__description{max-width:760px;color:#646a73;font-size:14px;font-weight:400;line-height:22px}
.performance-assessment-method-header__help{display:inline-flex;align-items:center;color:#1456f0;font-size:14px;line-height:22px;text-decoration:none}
.performance-assessment-method-header__help:hover{color:#3370ff}
.performance-assessment-method-header__switch{flex:0 0 auto}
</style>
