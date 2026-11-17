<template>
  <div class="evaluation-result-rules">
    <div class="evaluation-result-rules__title">评估结果校验提示规则</div>
    <div class="evaluation-result-rule-card">
      <div class="evaluation-result-rule-card__title">不同评估环节的评估结果差异提示</div>
      <p>可设置当不同环节中相同评估项的评估结果有一定差异时，会触发差异提示。</p>
      <UiTable v-if="modelValue.length" class="comparison-rule-summary-table" :columns="summaryColumns" :rows="modelValue" :row-key="(_row, index) => index" aria-label="评估结果差异提示规则">
        <template #cell="{ column, row: rule }">
          <div v-if="column.key === 'stages'" class="comparison-rule-summary-table__tags"><PerformanceSelectTag class="comparison-rule-tag" :label="stageName(rule, rule.first_node_id)" :closable="false" /><span>与</span><PerformanceSelectTag class="comparison-rule-tag" :label="stageName(rule, rule.second_node_id)" :closable="false" /></div>
          <div v-else-if="column.key === 'rules'" class="comparison-rule-summary-table__rules">
            <div class="comparison-rule-summary-table__conditions"><div v-for="(condition, index) in rule.indicator_diff_rules" :key="`${condition.content_id}:${condition.item_id}`" class="comparison-rule-summary-table__rule"><span v-if="index" class="comparison-rule-summary-table__or">或</span><PerformanceSelectTag class="comparison-rule-tag" :label="itemName(rule, condition)" :closable="false" /><span>相差 {{ operatorLabel(condition.operator) }}</span><span>{{ condition.threshold }} 档</span></div></div>
            <PerformanceInfoPopover v-if="summaryWarning(rule)" :content="summaryWarning(rule)" icon-color="var(--performance-prompt-warning-icon)" />
          </div>
          <div v-else-if="column.key === 'prompts'" class="comparison-rule-summary-table__prompt-list"><PerformanceSelectTag v-for="prompt in promptLabels(rule)" :key="prompt" class="comparison-rule-tag" :label="prompt" :closable="false" /></div>
          <div v-else class="comparison-rule-summary-table__actions"><PerformanceDisabledReason :disabled="!editable || disabled" :reason="!editable ? '已有启动项目，暂不支持修改' : ''"><UiButton variant="text" :disabled="!editable || disabled" @click="edit(rule)">编辑</UiButton></PerformanceDisabledReason><UiButton variant="text" :disabled="disabled || deleting" @click="askRemove(rule)">删除</UiButton></div>
        </template>
      </UiTable>
      <PerformanceDisabledReason :disabled="!editable || disabled || !templateIds.length" :reason="!editable ? '已有启动项目，不支持添加' : !templateIds.length ? '请选择绩效模板' : ''">
        <UiButton class="evaluation-result-rule-add" variant="text" aria-label="添加需对比的环节" :disabled="!editable || disabled || !templateIds.length" @click="add"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2a1 1 0 0 0-1 1v8H3a1 1 0 1 0 0 2h8v8a1 1 0 0 0 2 0v-8h8a1 1 0 0 0 0-2h-8V3a1 1 0 0 0-1-1Z" fill="currentColor" /></svg><span>添加需对比的环节</span></UiButton>
      </PerformanceDisabledReason>
    </div>
    <PerformanceComparisonRuleDrawer v-model="drawerOpen" :template-ids="templateIds" :cycle-id="cycleId" :initial-value="editingRule" :existing-rules="modelValue.filter((_, index) => index !== editingIndex)" @submit="save" />
    <PerformanceConfirmDialog v-model="deleteOpen" message="确定删除此对比的环节？" description="删除后将不再触发差异提示，若已产生的差异提示也会不再展示。确定删除吗？" require-confirm confirm-label="请输入「确认删除」以确认当前操作" cancel-text="保留" confirm-text="删除" :loading="deleting" :confirm-disabled="disabled" :error-message="deleteError" @confirm="remove" />
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { performanceCycleApi, type PerformanceComparisonCandidates, type PerformanceComparisonRule } from '@/api/performance'
import UiButton from '../ui/UiButton.vue'
import UiTable from '../ui/UiTable.vue'
import PerformanceComparisonRuleDrawer from './PerformanceComparisonRuleDrawer.vue'
import PerformanceConfirmDialog from './PerformanceConfirmDialog.vue'
import PerformanceInfoPopover from './PerformanceInfoPopover.vue'
import PerformanceSelectTag from './PerformanceSelectTag.vue'
import PerformanceDisabledReason from './PerformanceDisabledReason.vue'
const props = withDefaults(defineProps<{ modelValue: PerformanceComparisonRule[]; templateIds: number[]; cycleId?: number; editable?: boolean; editableReason?: string | null; disabled?: boolean; deleting?: boolean; deleteError?: string }>(), { editable: true, editableReason: '', disabled: false, deleting: false, deleteError: '' })
const emit = defineEmits<{ 'update:modelValue': [value: PerformanceComparisonRule[]]; remove: [index: number]; 'clear-delete-error': [] }>()
const drawerOpen = ref(false)
const deleteOpen = ref(false)
const candidates = ref<Record<string, PerformanceComparisonCandidates>>({})
const editingIndex = ref<number | null>(null)
const deletingRule = ref<PerformanceComparisonRule | null>(null)
const editingRule = computed(() => editingIndex.value === null ? null : props.modelValue[editingIndex.value] || null)
const summaryColumns = [{ key: 'stages', label: '对比环节', width: 240 }, { key: 'rules', label: '评估项差异规则', width: 217 }, { key: 'prompts', label: '差异提示方式', width: 240 }, { key: 'actions', label: '操作', width: 100, fixed: 'right' as const }]
let requestEpoch = 0
const pairKey = (rule: PerformanceComparisonRule) => JSON.stringify([rule.template_id, rule.first_node_id, rule.second_node_id])
const dataFor = (rule: PerformanceComparisonRule) => candidates.value[pairKey(rule)]
const templateFor = (rule: PerformanceComparisonRule) => dataFor(rule)?.templates.find(item => item.template_id === rule.template_id)
const stageName = (rule: PerformanceComparisonRule, id: string) => templateFor(rule)?.stages.find(stage => stage.node_id === id)?.name || id
const itemName = (rule: PerformanceComparisonRule, condition: PerformanceComparisonRule['indicator_diff_rules'][number]) => dataFor(rule)?.items.find(item => item.content_id === condition.content_id && item.item_id === condition.item_id)?.label || '评估项信息不可用'
const operatorLabel = (operator: string) => ({ eq: '=', gt: '>', gte: '≥', lt: '<', lte: '≤' }[operator] || operator)
const promptLabels = (rule: PerformanceComparisonRule) => [rule.show_notice_in_review && '评估过程中展示差异提示', rule.fill_in_diff_reason && `评估提交时填写差异理由(${rule.diff_reason_required ? '必填' : '非必填'})`, rule.send_notification && '给对应环节的评估人发送通知提醒'].filter((label): label is string => Boolean(label))
const summaryWarning = (rule: PerformanceComparisonRule) => (dataFor(rule)?.warnings || []).filter(warning => rule.indicator_diff_rules.some(item => item.content_id === warning.content_id && item.item_id === warning.item_id)).map(warning => {
  const item = dataFor(rule)?.items.find(item => item.content_id === warning.content_id && item.item_id === warning.item_id)
  const template = templateFor(rule)
  return template && item ? `绩效模板「${template.name}」中，${stageName(rule, warning.stage_id)}的环节执行人无法查看${stageName(rule, warning.ref_stage_id)}的「${item.label}」评估项，不会触发对应评估项的差异提示。` : warning.message
}).join('\n')
function add() { editingIndex.value = null; drawerOpen.value = true }
function edit(rule: PerformanceComparisonRule) { editingIndex.value = props.modelValue.indexOf(rule); drawerOpen.value = true }
function askRemove(rule: PerformanceComparisonRule) { deletingRule.value = rule; deleteOpen.value = true }
function save(value: PerformanceComparisonRule) {
  if (!props.editable || props.disabled) return
  const rules = [...props.modelValue]
  if (editingIndex.value === null) rules.push(value)
  else rules.splice(editingIndex.value, 1, value)
  emit('update:modelValue', rules)
}
function remove() {
  const index = props.modelValue.findIndex(rule => rule === deletingRule.value || Boolean(rule.id && rule.id === deletingRule.value?.id))
  if (!props.disabled && !props.deleting && index >= 0) emit('remove', index)
}
watch(deleteOpen, value => { if (value) emit('clear-delete-error') })
watch(() => props.modelValue, rules => { if (deletingRule.value && !rules.some(rule => rule === deletingRule.value || Boolean(rule.id && rule.id === deletingRule.value?.id))) deleteOpen.value = false })
watch(() => [props.editable, props.disabled], () => { if (!props.editable || props.disabled) drawerOpen.value = false })
watch(() => [props.modelValue.map(pairKey).join('|'), props.templateIds.join(','), props.cycleId], async () => {
  const epoch = ++requestEpoch
  const pairs = [...new Map(props.modelValue.map(rule => [pairKey(rule), rule])).entries()]
  const results = await Promise.all(pairs.map(async ([key, rule]) => {
    try {
      const result = await performanceCycleApi.comparisonOptions({ template_ids: [...props.templateIds], ...(props.cycleId ? { cycle_id: props.cycleId } : {}), template_id: rule.template_id, first_node_id: rule.first_node_id, second_node_id: rule.second_node_id })
      return [key, result] as const
    } catch { return [key, { templates: [], items: [], warnings: [] }] as const }
  }))
  if (epoch === requestEpoch) candidates.value = Object.fromEntries(results)
}, { immediate: true })
</script>
<style scoped>
.evaluation-result-rules__title { margin-bottom: var(--spacing-3); color: var(--color-text-primary); font-size: var(--font-size-md); font-weight: 600; line-height: var(--performance-button-line-height); }
.evaluation-result-rule-card { min-height: var(--performance-comparison-card-min-height); padding: var(--performance-comparison-card-padding-y) var(--spacing-2); box-sizing: border-box; border-radius: var(--radius-md); background: var(--performance-evaluation-rule-surface); }
.evaluation-result-rule-card__title { color: var(--color-text-primary); font-size: var(--font-size-md); font-weight: 600; line-height: var(--performance-button-line-height); }
.evaluation-result-rule-card p { margin: 0; color: var(--performance-count-badge-text); font: 400 var(--font-size-md)/var(--performance-button-line-height) var(--font-sans); }
.evaluation-result-rule-add { min-height: var(--performance-comparison-add-height); height: var(--performance-comparison-add-height); justify-content: flex-start; gap: var(--spacing-1); margin-top: var(--spacing-1); padding: var(--performance-comparison-add-padding-y) var(--spacing-1); line-height: var(--performance-comparison-add-line-height); }
.evaluation-result-rule-add svg { width: var(--font-size-md); height: var(--font-size-md); flex: 0 0 var(--font-size-md); }
.comparison-rule-summary-table { margin-top: var(--spacing-3); --ui-table-header-background: transparent; color: var(--color-text-primary); font: 400 var(--font-size-md)/var(--performance-button-line-height) var(--font-sans); }
.comparison-rule-summary-table__tags, .comparison-rule-summary-table__rule { display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-2); }
.comparison-rule-summary-table__conditions { display: flex; flex-direction: column; gap: var(--spacing-2); }
.comparison-rule-summary-table__rule { min-height: var(--performance-select-tag-height); }
.comparison-rule-summary-table__prompt-list { display: flex; align-items: flex-start; flex-direction: column; gap: var(--spacing-1); }
.comparison-rule-summary-table__actions { display: flex; align-items: center; white-space: nowrap; }
.comparison-rule-summary-table__actions :deep(.performance-button) { padding-inline: var(--spacing-1); }
.comparison-rule-summary-table__rules { display: flex; align-items: flex-end; gap: var(--spacing-2); }
.comparison-rule-summary-table :deep(.ui-table__cell-content) { overflow: visible; }
.comparison-rule-summary-table :deep(.ui-table__grid), .comparison-rule-summary-table :deep(.ui-table__cell:not(.is-fixed-right)) { background: transparent; }
.comparison-rule-summary-table__or { color: var(--color-text-secondary); }
.comparison-rule-tag { display: inline-flex; align-items: center; min-width: 0; max-width: 100%; height: var(--performance-select-tag-height); margin: 0; padding: 0 var(--performance-select-tag-padding-x); border-radius: var(--performance-select-tag-radius); background: var(--performance-select-tag-background); color: var(--color-text-primary); white-space: nowrap; }
.comparison-rule-tag :deep(.performance-select-shell__tag-content) { max-width: 200px; }
</style>
