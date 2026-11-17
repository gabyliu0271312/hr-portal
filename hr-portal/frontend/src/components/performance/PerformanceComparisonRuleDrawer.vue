<template>
  <UiDrawerShell v-model="open" :title="initialValue ? '编辑需对比的环节' : '添加需对比的环节'" width="var(--drawer-wide-width)" variant="captured" body-class="performance-comparison-rule-drawer__body" class="comparison-rule-drawer" style="--performance-drawer-captured-header-height: var(--performance-comparison-drawer-header-height); --performance-drawer-captured-header-padding: var(--performance-comparison-drawer-header-padding); --performance-drawer-captured-body-padding: var(--performance-comparison-drawer-body-padding); --performance-drawer-captured-footer-height: var(--performance-comparison-drawer-footer-height); --performance-drawer-captured-footer-padding: var(--performance-comparison-drawer-footer-padding)" @close="cancel">
    <template #header><h2 class="comparison-rule-drawer__title">{{ initialValue ? '编辑需对比的环节' : '添加需对比的环节' }}</h2></template>
    <form class="comparison-rule-form" novalidate @submit.prevent="submit">
      <section class="comparison-rule-section" aria-labelledby="comparison-stages-title">
        <h3 id="comparison-stages-title" class="comparison-rule-section__title"><PerformanceRequiredLabel label="需对比的评估环节" /></h3>
        <div class="comparison-stage-row">
          <PerformanceAssessmentSelect v-model="draft.firstKey" label="" aria-label="第一个评估环节" placeholder="请选择评估环节" :options="stageOptions" :disabled="loading && !stageOptions.length" :invalid="submitted && !firstStage" empty-text="暂无可选评估环节" />
          <span class="comparison-stage-row__operator">与</span>
          <PerformanceAssessmentSelect v-model="draft.secondKey" label="" aria-label="第二个评估环节" placeholder="请选择评估环节" :options="secondStageOptions" :disabled="!firstStage" :invalid="submitted && !secondStage" empty-text="暂无可选评估环节" />
        </div>
        <span v-if="loading" class="comparison-rule-loading" role="status">正在加载可选项...</span>
        <p v-if="loadError" class="comparison-rule-error" role="alert">{{ loadError }} <UiButton variant="text" @click="loadCandidates">重试</UiButton></p>
        <p v-if="!loading && !loadError && !stageOptions.length" class="comparison-rule-state">暂无可选评估环节</p>
        <p v-if="stageError" class="comparison-rule-error" role="alert">{{ stageError }}</p>
      </section>
      <section class="comparison-rule-section" aria-labelledby="difference-rules-title">
        <h3 id="difference-rules-title" class="comparison-rule-section__title"><PerformanceRequiredLabel label="评估项差异规则" /></h3>
        <p class="comparison-rule-section__description">若所选环节的执行人有权限查看对应环节的评估项（在绩效模板的参考内容中配置查看权限），则当两个评估环节的评估项之间发生以下差异时，会触发差异提示</p>
        <PerformancePromptNotice v-for="(warning, index) in visibleWarnings" :key="index" class="comparison-rule-warning" type="warning" multiline role="alert"><template #icon><svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M23 12c0 6.075-4.925 11-11 11S1 18.075 1 12 5.925 1 12 1s11 4.925 11 11Z" fill="currentColor"/><path d="M12 7a1 1 0 0 0-1 1v5a1 1 0 1 0 2 0V8a1 1 0 0 0-1-1Zm0 8a1 1 0 1 0 0 2 1 1 0 0 0-2 0 1 1 0 0 0 2 0Z" fill="var(--performance-prompt-icon-inner)"/></svg></template>{{ warning }}</PerformancePromptNotice>
        <div class="comparison-condition-list">
          <div v-for="(rule, index) in draft.rules" :key="rule.key" class="comparison-condition-row">
            <PerformanceAssessmentSelect v-model="rule.itemKey" label="" aria-label="评估项" placeholder="请选择评估项" :options="itemOptions" :invalid="submitted && !itemOptions.some(item => item.id === rule.itemKey)" :empty-text="loading ? '正在加载可选项...' : loadError || '暂无可选选项'" />
            <span class="comparison-condition-row__operator">相差</span>
            <PerformanceMetricSelect v-model="rule.operator" ariaLabel="差异类型" placeholder="请选择" :options="operatorOptions" />
            <PerformanceNumberInput v-model="rule.threshold" width="100%" suffix="档" suffix-variant="addon" aria-label="差异阈值" :min="1" :step="1" :invalid="submitted && !isPositiveInteger(rule.threshold)" placeholder="请输入数字" />
            <PerformanceIconButton icon="DeleteTrashOutlined" :label="`删除第${index + 1}条差异规则`" :disabled="draft.rules.length === 1" @click="removeRule(index)" />
          </div>
        </div>
        <p v-if="ruleError" class="comparison-rule-error" role="alert">{{ ruleError }}</p>
        <UiButton class="comparison-condition-add" variant="text" @click="addRule"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2a1 1 0 0 0-1 1v8H3a1 1 0 1 0 0 2h8v8a1 1 0 0 0 2 0v-8h8a1 1 0 0 0 0-2h-8V3a1 1 0 0 0-1-1Z" fill="currentColor" /></svg><span>添加规则</span></UiButton>
      </section>
      <section class="comparison-rule-section" aria-labelledby="prompt-methods-title">
        <h3 id="prompt-methods-title" class="comparison-rule-section__title"><PerformanceRequiredLabel label="发生差异时的提示方式" /></h3>
        <p class="comparison-rule-section__description">当此环节被其它查看人参考查看时，若其它查看人有两个对比环节的评估项查看权限，则在人员详情页也能看到相应的差异提示。</p>
        <div class="comparison-prompt-list" role="group" aria-label="发生差异时的提示方式">
          <div class="comparison-prompt-row"><PerformanceCheckbox v-model="draft.show_notice_in_review" label="评估过程中展示差异提示" /><PerformanceInfoPopover content="评估过程中展示差异提示" /></div>
          <div class="comparison-prompt-row"><PerformanceCheckbox v-model="draft.fill_in_diff_reason" label="评估提交时填写差异理由" /><PerformanceInfoPopover content="评估提交时填写差异理由" /></div>
          <PerformanceRadioGroup v-if="draft.fill_in_diff_reason" v-model="draft.reasonRequired" class="comparison-reason-required" :options="reasonOptions" name="comparison-reason-required" direction="vertical" gap="var(--performance-comparison-rule-gap)" aria-label="差异理由填写要求" />
          <div class="comparison-prompt-row"><PerformanceCheckbox v-model="draft.send_notification" label="给对应环节的评估人发送通知提醒" /><PerformanceInfoPopover content="给对应环节的评估人发送通知提醒" /></div>
        </div>
        <p v-if="promptError" class="comparison-rule-error" role="alert">{{ promptError }}</p>
      </section>
    </form>
    <template #footer><PerformanceDrawerFooter variant="captured" confirm-text="提交" cancel-text="取消" :confirm-disabled="loading || Boolean(loadError)" @confirm="submit" @cancel="cancel" /></template>
  </UiDrawerShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { performanceCycleApi, type PerformanceComparisonCandidates, type PerformanceComparisonOperator, type PerformanceComparisonRule } from '@/api/performance'
import UiButton from '../ui/UiButton.vue'
import UiDrawerShell from '../ui/UiDrawerShell.vue'
import PerformanceAssessmentSelect from './PerformanceAssessmentSelect.vue'
import PerformanceCheckbox from './PerformanceCheckbox.vue'
import PerformanceDrawerFooter from './PerformanceDrawerFooter.vue'
import PerformanceIconButton from './PerformanceIconButton.vue'
import PerformanceInfoPopover from './PerformanceInfoPopover.vue'
import PerformanceMetricSelect from './PerformanceMetricSelect.vue'
import PerformanceNumberInput from './PerformanceNumberInput.vue'
import PerformancePromptNotice from './PerformancePromptNotice.vue'
import PerformanceRadioGroup from './PerformanceRadioGroup.vue'
import PerformanceRequiredLabel from './PerformanceRequiredLabel.vue'

const props = withDefaults(defineProps<{ modelValue: boolean; templateIds: number[]; cycleId?: number; initialValue?: PerformanceComparisonRule | null }>(), { initialValue: null })
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; cancel: []; submit: [value: PerformanceComparisonRule] }>()
const open = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const operatorOptions = [{ value: 'eq', label: '=' }, { value: 'gt', label: '>' }, { value: 'gte', label: '≥' }, { value: 'lt', label: '<' }, { value: 'lte', label: '≤' }]
const reasonOptions = [{ value: 'required', label: '必填' }, { value: 'optional', label: '非必填' }]
const candidates = ref<PerformanceComparisonCandidates>({ templates: [], items: [], warnings: [] })
const loading = ref(false)
const loadError = ref('')
const submitted = ref(false)
let requestEpoch = 0
let ruleKey = 0
const newRule = () => ({ key: ++ruleKey, itemKey: '', operator: 'eq' as PerformanceComparisonOperator, threshold: '' })
const draft = reactive({ firstKey: '', secondKey: '', rules: [newRule()], show_notice_in_review: false, fill_in_diff_reason: false, reasonRequired: 'required', send_notification: false })
const stageKey = (templateId: number, nodeId: string) => JSON.stringify([templateId, nodeId])
const itemKey = (contentId: string, itemId: string) => JSON.stringify([contentId, itemId])
const stages = computed(() => candidates.value.templates.flatMap(template => template.stages.map(stage => ({ ...stage, template_id: template.template_id, template_name: template.name, key: stageKey(template.template_id, stage.node_id) }))))
const firstStage = computed(() => stages.value.find(stage => stage.key === draft.firstKey))
const secondStage = computed(() => stages.value.find(stage => stage.key === draft.secondKey && stage.template_id === firstStage.value?.template_id && stage.key !== draft.firstKey))
const stageOptions = computed(() => stages.value.map(stage => ({ id: stage.key, label: stage.name, description: candidates.value.templates.length > 1 ? stage.template_name : undefined })))
const secondStageOptions = computed(() => stages.value.filter(stage => stage.template_id === firstStage.value?.template_id && stage.key !== draft.firstKey).map(stage => ({ id: stage.key, label: stage.name })))
const itemOptions = computed(() => candidates.value.items.map(item => ({ id: itemKey(item.content_id, item.item_id), label: item.label, ...(loading.value || loadError.value ? { disabled: true } : {}) })))
const visibleWarnings = computed(() => candidates.value.warnings.flatMap(warning => {
  const item = candidates.value.items.find(item => item.content_id === warning.content_id && item.item_id === warning.item_id)
  if (!item) return [warning.message]
  if (!draft.rules.some(rule => rule.itemKey === itemKey(item.content_id, item.item_id))) return []
  const template = candidates.value.templates.find(template => template.template_id === warning.template_id)
  const stage = template?.stages.find(stage => stage.node_id === warning.stage_id)
  const reference = template?.stages.find(stage => stage.node_id === warning.ref_stage_id)
  if (!template || !stage || !reference) return [warning.message]
  return [`绩效模板「${template.name}」中，${stage.name}的环节执行人无法查看${reference.name}的「${item.label}」评估项，不会触发对应评估项的差异提示。`]
}))
const stageError = computed(() => submitted.value && (!firstStage.value || !secondStage.value) ? '请选择需要对比的评估环节' : '')
const ruleError = computed(() => submitted.value && draft.rules.some(rule => !itemOptions.value.some(item => item.id === rule.itemKey) || !isPositiveInteger(rule.threshold)) ? '请完善评估项差异规则' : '')
const promptError = computed(() => submitted.value && !draft.show_notice_in_review && !draft.fill_in_diff_reason && !draft.send_notification ? '至少选择一种提示方式' : '')
function isPositiveInteger(value: string) { return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) }
function reset() {
  const value = props.initialValue
  draft.firstKey = value ? stageKey(value.template_id, value.first_node_id) : ''
  draft.secondKey = value ? stageKey(value.template_id, value.second_node_id) : ''
  draft.rules = value?.indicator_diff_rules.length ? value.indicator_diff_rules.map(rule => ({ key: ++ruleKey, itemKey: itemKey(rule.content_id, rule.item_id), operator: rule.operator, threshold: String(rule.threshold) })) : [newRule()]
  draft.show_notice_in_review = value?.show_notice_in_review ?? false
  draft.fill_in_diff_reason = value?.fill_in_diff_reason ?? false
  draft.reasonRequired = value?.diff_reason_required === false ? 'optional' : 'required'
  draft.send_notification = value?.send_notification ?? false
  candidates.value = { templates: [], items: [], warnings: [] }
  submitted.value = false
}
async function loadCandidates() {
  const epoch = ++requestEpoch
  if (!props.modelValue) return
  loading.value = true
  loadError.value = ''
  const pair = draft.firstKey && draft.secondKey ? { template_id: JSON.parse(draft.firstKey)[0], first_node_id: JSON.parse(draft.firstKey)[1], second_node_id: JSON.parse(draft.secondKey)[1] } : {}
  if (!pair.second_node_id) {
    candidates.value.items = []
    candidates.value.warnings = []
  }
  try {
    const result = await performanceCycleApi.comparisonOptions({ template_ids: [...props.templateIds], ...(props.cycleId ? { cycle_id: props.cycleId } : {}), ...pair })
    if (epoch !== requestEpoch || !props.modelValue) return
    candidates.value = { ...result, items: pair.second_node_id ? result.items : [] }
    const validIds = new Set(itemOptions.value.map(item => item.id))
    draft.rules.forEach(rule => { if (!validIds.has(rule.itemKey)) rule.itemKey = '' })
  } catch {
    if (epoch === requestEpoch) loadError.value = '可选项加载失败，请重试'
  } finally {
    if (epoch === requestEpoch) loading.value = false
  }
}
function addRule() { draft.rules.push(newRule()) }
function removeRule(index: number) { if (draft.rules.length > 1) draft.rules.splice(index, 1) }
function cancel() { submitted.value = false; emit('cancel'); open.value = false }
function submit() {
  submitted.value = true
  if (loading.value || loadError.value || stageError.value || ruleError.value || promptError.value || !firstStage.value || !secondStage.value) return
  emit('submit', {
    ...(props.initialValue?.id ? { id: props.initialValue.id } : {}), template_id: firstStage.value.template_id, first_node_id: firstStage.value.node_id, second_node_id: secondStage.value.node_id,
    indicator_diff_rules: draft.rules.map(rule => { const [content_id, item_id] = JSON.parse(rule.itemKey); return { content_id, item_id, operator: rule.operator, threshold: Number(rule.threshold) } }),
    show_notice_in_review: draft.show_notice_in_review, fill_in_diff_reason: draft.fill_in_diff_reason, diff_reason_required: draft.reasonRequired === 'required', send_notification: draft.send_notification,
  })
  open.value = false
}
watch(() => props.modelValue, value => { if (value) { reset(); void loadCandidates() } else { ++requestEpoch; loading.value = false } }, { immediate: true })
watch(() => draft.firstKey, () => { if (draft.secondKey && (!draft.firstKey || draft.firstKey === draft.secondKey || JSON.parse(draft.firstKey)[0] !== JSON.parse(draft.secondKey)[0])) draft.secondKey = '' })
watch(() => [draft.firstKey, draft.secondKey, props.templateIds.join(','), props.cycleId], () => { if (props.modelValue) void loadCandidates() })
onBeforeUnmount(() => { ++requestEpoch })
</script>

<style scoped>
.comparison-rule-drawer__title { margin: 0; font: 600 var(--font-size-lg)/24px var(--font-sans); }
.comparison-rule-form { display: flex; flex: 1; flex-direction: column; min-width: 0; color: var(--color-text-primary); font: 400 var(--font-size-md)/var(--performance-button-line-height) var(--font-sans); }
.comparison-rule-section { flex: none; margin: 0 0 var(--spacing-5); }
.comparison-rule-section:nth-child(2) { padding-bottom: var(--spacing-4); }
.comparison-rule-section:not(:first-child) .comparison-rule-section__title, .comparison-rule-section__description { margin: 0; }
.comparison-rule-warning { margin-bottom: var(--spacing-4); --ui-notice-text-bottom-gap: 0px; }
.comparison-rule-warning :deep(.prompt-notice__text) { flex: 1; margin-right: calc(-1 * var(--spacing-4)); }
.comparison-rule-loading { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.comparison-rule-drawer :deep(.performance-assessment-select .select-shell > button > span) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.comparison-rule-drawer :deep(.performance-assessment-select .select-shell > button > svg) { flex-shrink: 0; }
.comparison-rule-section:last-child { margin-bottom: 0; }
.comparison-rule-section__title { min-height: var(--performance-button-line-height); margin: 0 0 var(--spacing-2); font: inherit; font-weight: 600; }
.comparison-rule-section__description { margin: 0; color: var(--performance-text-secondary); }
.comparison-rule-state { margin: 0 0 var(--spacing-2); color: var(--color-text-secondary); }
.comparison-stage-row { display: grid; grid-template-columns: minmax(0, var(--performance-comparison-stage-width)) var(--performance-comparison-stage-connector-width) minmax(0, var(--performance-comparison-stage-width)); align-items: start; gap: var(--spacing-2); }
.comparison-stage-row__operator, .comparison-condition-row__operator { display: flex; align-items: center; justify-content: center; min-height: var(--performance-control-height); white-space: nowrap; }
.comparison-condition-list { display: flex; flex-direction: column; gap: var(--performance-comparison-rule-gap); }
.comparison-condition-row { display: grid; grid-template-columns: var(--performance-comparison-item-width) var(--performance-comparison-connector-width) var(--performance-comparison-operator-width) minmax(0, 1fr) var(--performance-comparison-delete-width); align-items: start; gap: var(--performance-comparison-rule-gap); }
.comparison-condition-row > * { min-width: 0; }
.comparison-condition-row > :deep(.performance-metric-select) { --performance-input-height: var(--performance-control-height); }
.comparison-condition-row > :deep(.performance-icon-button) { margin-top: var(--performance-comparison-delete-offset); }
.comparison-condition-add { display: flex; width: var(--performance-comparison-add-width); height: var(--performance-comparison-add-height); min-height: var(--performance-comparison-add-height); justify-content: flex-start; gap: var(--spacing-1); margin-top: var(--spacing-2); padding: var(--performance-comparison-add-padding-y) var(--spacing-1); line-height: var(--performance-comparison-add-line-height); }
.comparison-condition-add svg { width: var(--font-size-md); height: var(--font-size-md); flex: 0 0 var(--font-size-md); }
.comparison-prompt-list { display: flex; flex-direction: column; gap: var(--performance-comparison-rule-gap); margin-top: var(--spacing-1); }
.comparison-prompt-row { display: flex; align-items: center; gap: var(--spacing-2); min-height: var(--performance-button-line-height); }
.comparison-prompt-row :deep(.performance-checkbox) { width: auto; }
.comparison-reason-required { margin-left: var(--performance-comparison-reason-indent); }
.comparison-rule-error { margin: var(--spacing-1) 0 0; color: var(--performance-field-error-color); font-size: var(--performance-field-error-font-size); line-height: var(--performance-field-error-line-height); }
@media (max-width: 640px) { .comparison-condition-row { grid-template-columns: minmax(0, 1fr) var(--performance-comparison-connector-width) minmax(0, 1fr) var(--performance-comparison-delete-width); } .comparison-condition-row > :first-child { grid-column: 1 / -1; } }
</style>
