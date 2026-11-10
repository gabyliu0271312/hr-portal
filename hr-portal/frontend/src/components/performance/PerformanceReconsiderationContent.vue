<template>
  <section class="performance-reconsideration-content">
    <h1 v-if="title" class="reconsideration-title">{{ title }}</h1>
    <h2 class="reconsideration-reason-title">复议理由</h2>
    <PerformanceReadonlyAnswer class="reconsideration-reason" :field="reasonField" :value="reason" />
    <template v-if="showResultAndModify">
      <div class="reconsideration-choice-label">是否保持复议前结果</div>
      <PerformanceSingleSelectControl class="reconsideration-choice" :model-value="modelValue" :options="options" :interactive="interactive" aria-label="是否保持复议前结果" @update:model-value="value => emit('update:modelValue', value as 'keep' | 'change')" />
      <div v-if="modelValue === 'change'" class="reconsideration-result">
        <h2 class="reconsideration-result-title">绩效结果</h2>
        <slot />
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import PerformanceReadonlyAnswer from './PerformanceReadonlyAnswer.vue'
import PerformanceSingleSelectControl from './PerformanceSingleSelectControl.vue'
withDefaults(defineProps<{ title?: string; reason?: string | null; modelValue: 'keep' | 'change'; showResultAndModify?: boolean; interactive?: boolean }>(), { title: '', reason: '', showResultAndModify: true, interactive: false })
const emit = defineEmits<{ 'update:modelValue': [value: 'keep' | 'change'] }>()
const reasonField = { id: 'reconsideration-reason', type: 'rich_text' as const, label: '复议理由', readonly: true }
const options = [{ id: 'keep', label: '保持原结果' }, { id: 'change', label: '变更结果' }]
</script>

<style scoped>
.performance-reconsideration-content{min-width:0;color:var(--color-text-primary)}
.reconsideration-title{margin:0 0 16px;font-size:16px;font-weight:600;line-height:24px}
.reconsideration-reason-title{position:relative;margin:0;padding-left:10px;font-size:16px;font-weight:600;line-height:24px}
.reconsideration-reason-title::before{position:absolute;left:0;top:4px;width:2px;height:16px;background:var(--color-primary);content:''}
.reconsideration-reason{margin:16px 0 28px}
.reconsideration-choice-label{margin-bottom:8px;font-size:14px;font-weight:600;line-height:22px}
.reconsideration-result{margin-top:20px}
.reconsideration-result-title{margin:0 0 20px;font-size:16px;font-weight:600;line-height:24px}
</style>
