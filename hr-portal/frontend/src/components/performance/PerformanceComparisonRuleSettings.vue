<template>
  <div class="evaluation-result-rules">
    <div class="evaluation-result-rules__title">评估结果校验提示规则</div>
    <div class="evaluation-result-rule-card">
      <div class="evaluation-result-rule-card__title">不同评估环节的评估结果差异提示</div>
      <p>可设置当不同环节中相同评估项的评估结果有一定差异时，会触发差异提示。</p>
      <div v-if="rule" class="comparison-rule-summary">
        <span>{{ summary }}</span>
        <PerformanceDisabledReason :disabled="!editable || disabled" :reason="editableReason || ''"><UiButton variant="text" :disabled="!editable || disabled" @click="drawerOpen = true">编辑</UiButton></PerformanceDisabledReason>
        <UiButton variant="text" :disabled="disabled || deleting" @click="deleteOpen = true">删除</UiButton>
      </div>
      <PerformanceDisabledReason v-else :disabled="!editable || disabled || !templateIds.length" :reason="!templateIds.length ? '请选择绩效模板' : editableReason || ''">
        <UiButton class="evaluation-result-rule-add" variant="text" aria-label="添加需对比的环节" :disabled="!editable || disabled || !templateIds.length" @click="drawerOpen = true"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2a1 1 0 0 0-1 1v8H3a1 1 0 1 0 0 2h8v8a1 1 0 0 0 2 0v-8h8a1 1 0 0 0 0-2h-8V3a1 1 0 0 0-1-1Z" fill="currentColor" /></svg><span>添加需对比的环节</span></UiButton>
      </PerformanceDisabledReason>
    </div>
    <PerformanceComparisonRuleDrawer v-model="drawerOpen" :template-ids="templateIds" :cycle-id="cycleId" :initial-value="rule" @submit="save" />
    <PerformanceConfirmDialog v-model="deleteOpen" message="确定删除该差异提示规则吗？" cancel-text="取消" confirm-text="删除" :loading="deleting" :error-message="deleteError" @confirm="remove" />
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { performanceCycleApi, type PerformanceComparisonCandidates, type PerformanceComparisonRule } from '@/api/performance'
import UiButton from '../ui/UiButton.vue'
import PerformanceComparisonRuleDrawer from './PerformanceComparisonRuleDrawer.vue'
import PerformanceConfirmDialog from './PerformanceConfirmDialog.vue'
import PerformanceDisabledReason from './PerformanceDisabledReason.vue'
const props = withDefaults(defineProps<{ modelValue: PerformanceComparisonRule[]; templateIds: number[]; cycleId?: number; editable?: boolean; editableReason?: string | null; disabled?: boolean; deleting?: boolean; deleteError?: string }>(), { editable: true, editableReason: '', disabled: false, deleting: false, deleteError: '' })
const emit = defineEmits<{ 'update:modelValue': [value: PerformanceComparisonRule[]]; remove: []; 'clear-delete-error': [] }>()
const drawerOpen = ref(false)
const deleteOpen = ref(false)
const names = ref<PerformanceComparisonCandidates['templates']>([])
let requestEpoch = 0
const rule = computed(() => props.modelValue[0] || null)
const summary = computed(() => {
  if (!rule.value) return ''
  const template = names.value.find(item => item.template_id === rule.value?.template_id)
  const name = (id: string) => template?.stages.find(stage => stage.node_id === id)?.name || id
  return `${names.value.length > 1 && template ? `${template.name}：` : ''}${name(rule.value.first_node_id)} 与 ${name(rule.value.second_node_id)}`
})
function save(value: PerformanceComparisonRule) { if (props.editable && !props.disabled) emit('update:modelValue', [value]) }
function remove() { if (!props.disabled && !props.deleting) emit('remove') }
watch(deleteOpen, value => { if (value) emit('clear-delete-error') })
watch(rule, value => { if (!value) deleteOpen.value = false })
watch(() => [props.editable, props.disabled], () => { if (!props.editable || props.disabled) drawerOpen.value = false })
watch(() => [rule.value?.template_id, props.templateIds.join(','), props.cycleId], async () => {
  const epoch = ++requestEpoch
  if (!rule.value) return
  try {
    const result = await performanceCycleApi.comparisonOptions({ template_ids: [...props.templateIds], ...(props.cycleId ? { cycle_id: props.cycleId } : {}) })
    if (epoch === requestEpoch) names.value = result.templates
  } catch { if (epoch === requestEpoch) names.value = [] }
}, { immediate: true })
</script>
<style scoped>
.evaluation-result-rules__title { margin-bottom: var(--spacing-3); color: var(--color-text-primary); font-size: var(--font-size-md); font-weight: 600; line-height: var(--performance-button-line-height); }
.evaluation-result-rule-card { min-height: var(--performance-comparison-card-min-height); padding: var(--performance-comparison-card-padding-y) var(--spacing-2); box-sizing: border-box; border-radius: var(--radius-md); background: var(--performance-evaluation-rule-surface); }
.evaluation-result-rule-card__title { color: var(--color-text-primary); font-size: var(--font-size-md); font-weight: 600; line-height: var(--performance-button-line-height); }
.evaluation-result-rule-card p { margin: 0; color: var(--performance-count-badge-text); font: 400 var(--font-size-md)/var(--performance-button-line-height) var(--font-sans); }
.evaluation-result-rule-add { min-height: var(--performance-comparison-add-height); height: var(--performance-comparison-add-height); justify-content: flex-start; gap: var(--spacing-1); margin-top: var(--spacing-1); padding: var(--performance-comparison-add-padding-y) var(--spacing-1); line-height: var(--performance-comparison-add-line-height); }
.evaluation-result-rule-add svg { width: var(--font-size-md); height: var(--font-size-md); flex: 0 0 var(--font-size-md); }
.comparison-rule-summary { display: flex; align-items: center; flex-wrap: wrap; gap: var(--spacing-2); color: var(--color-text-primary); font: 400 var(--font-size-md)/var(--performance-button-line-height) var(--font-sans); }
</style>
