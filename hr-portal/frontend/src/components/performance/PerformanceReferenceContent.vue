<template>
  <section class="performance-reference-content" :aria-label="reference.node_name">
    <h2 v-if="showTitle" class="reference-content-title">{{ reference.node_name }}</h2>
    <p v-if="reference.kind === 'okr' && okrLoading" role="status">正在加载 OKR…</p>
    <p v-if="reference.kind === 'okr' && okrError" role="alert">OKR 加载失败 <button type="button" @click="loadOkr">重试</button></p>
    <PerformanceOkrPanel v-if="reference.kind === 'okr' && !okrLoading && !okrError" :okr="okr" :okrs="okrs" />
    <PerformanceTemplateRenderer
      v-else-if="reference.status === 'completed' && reference.form_schema.length"
      mode="readonly"
      :sections="reference.form_schema"
      :answers="reference.answers"
    />
    <div v-else-if="reference.kind !== 'okr'" class="performance-reference-empty">
      <img v-if="reference.status === 'not_started'" src="/performance-not-started.svg" alt="" width="120" height="121">
      <img v-else src="/performance-no-submit.svg" alt="" width="120" height="120">
      <p>{{ reference.status === 'completed' ? '暂无可查看内容' : '暂未提交' }}</p>
      <PerformanceReminderButton v-if="reference.can_remind" variant="icon" @click="$emit('remind', reference)" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { performanceOkrApi, type PerformanceReferenceTab } from '@/api/performance'
import PerformanceOkrPanel from './PerformanceOkrPanel.vue'
import PerformanceTemplateRenderer from './PerformanceTemplateRenderer.vue'
import PerformanceReminderButton from './PerformanceReminderButton.vue'

const props = defineProps<{ reference: PerformanceReferenceTab; showTitle?: boolean }>()
const emit = defineEmits<{ remind: [reference: PerformanceReferenceTab] }>()
const okr = ref(props.reference.okr || null)
const okrs = ref(props.reference.okrs || [])
const okrLoading = ref(false)
const okrError = ref('')
let requestId = 0

async function loadOkr() {
  if (props.reference.kind !== 'okr' || !props.reference.task_id) return
  const current = ++requestId
  okrLoading.value = true
  okrError.value = ''
  try {
    const result = await performanceOkrApi.taskOkr(props.reference.task_id)
    if (current === requestId) { okr.value = result.okr || null; okrs.value = result.okrs || [] }
  } catch (error) {
    if (current === requestId) okrError.value = error instanceof Error ? error.message : 'OKR加载失败'
  } finally {
    if (current === requestId) okrLoading.value = false
  }
}
watch(() => props.reference, () => { ++requestId; okr.value = props.reference.okr || null; okrs.value = props.reference.okrs || []; okrLoading.value = false; okrError.value = ''; void loadOkr() }, { immediate: true })
onBeforeUnmount(() => { ++requestId })
</script>

<style scoped>
.reference-content-title{flex:none;margin:0 0 20px;color:var(--color-text-primary);font:600 16px/24px var(--font-sans)}
.performance-reference-content{width:100%;min-height:100%;box-sizing:border-box}.performance-reference-empty{display:flex;min-height:360px;flex-direction:column;align-items:center;justify-content:center;color:#646a73}.performance-reference-empty p{margin:8px 0 20px;color:#646a73;font-size:16px;line-height:24px}
</style>
