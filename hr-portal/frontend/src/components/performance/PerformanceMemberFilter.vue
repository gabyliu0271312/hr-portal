<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { projectManagementApi, type PerformanceMemberFilterOption, type PerformanceMemberFilterCondition, type PerformanceMemberFilterField as MemberFilterField, type PerformanceMemberFilters } from '@/api/performance'
import PerformancePopover from './PerformancePopover.vue'
import PerformanceSearchSelect from './PerformanceSearchSelect.vue'
import PerformanceMemberFilterField from './PerformanceMemberFilterField.vue'
import PerformanceMemberFilterValue from './PerformanceMemberFilterValue.vue'
import PerformanceMemberFilterPresets from './PerformanceMemberFilterPresets.vue'
import PerformanceIconButton from './PerformanceIconButton.vue'
import UiButton from '@/components/ui/UiButton.vue'

const props = defineProps<{ visible: boolean; anchor: HTMLElement | null; cycleId: number; modelValue: PerformanceMemberFilters; contextKey: string }>()
const emit = defineEmits<{ close: []; apply: [filters: PerformanceMemberFilters] }>()
const form = ref<HTMLElement | null>(null)
const fieldControls = ref<InstanceType<typeof PerformanceMemberFilterField>[]>([])
const fields = ref<MemberFilterField[]>([])
const candidateCache = new Map<string, PerformanceMemberFilterOption[]>()
function rememberCandidates(key: string, options: PerformanceMemberFilterOption[]) { candidateCache.set(key, options) }
const draft = ref<PerformanceMemberFilters>({ logic: 'and', conditions: [] })
const loading = ref(false)
const error = ref('')
const validationError = ref('')
let sequence = 0
const relationOptions = [{ value: 'and', label: '所有' }, { value: 'or', label: '任意' }]
const fieldFor = (condition: PerformanceMemberFilterCondition) => fields.value.find(field => field.key === condition.key)
const completeFilters = computed<PerformanceMemberFilters>(() => ({ logic: draft.value.logic, conditions: draft.value.conditions.filter(condition => {
  if (!condition.values.some(Boolean)) return false
  if (fieldFor(condition)?.kind !== 'date') return true
  return condition.values.length === 2 && condition.values.every(value => /^\d{4}-\d{2}-\d{2}$/.test(value)) && condition.values[0] <= condition.values[1]
}).map(condition => ({ ...condition, values: [...condition.values] })) }))
function defaults() {
  if (draft.value.conditions.length) return
  const keys = ['direct_supervisor', 'supervisors', 'department_path', 'department', 'position_level', 'job_sequence_descendants', 'job_sequence', 'name']
  draft.value.conditions = keys.flatMap(key => {
    const field = fields.value.find(item => item.key === key)
    if (!field || (key === 'job_sequence' && fields.value.some(item => item.key === 'job_sequence_descendants'))) return []
    return [{ key, op: field.operators[0].value, values: [] }]
  })
}
async function load() {
  const request = ++sequence
  loading.value = true
  error.value = ''
  try {
    const result = await projectManagementApi.cycleMemberFilterOptions(props.cycleId)
    if (request === sequence) {
      fields.value = result.fields.map(field => field.kind === 'person' ? { ...field, options: candidateCache.get(field.key) || [] } : field)
      if (props.visible) defaults()
    }
  } catch (cause: any) {
    if (request === sequence) error.value = cause?.response?.status === 403 ? '你没有当前成员范围的筛选权限' : '筛选条件加载失败，请重试'
  } finally { if (request === sequence) loading.value = false }
}
watch(() => [props.cycleId, props.contextKey], () => {
  fields.value = []
  candidateCache.clear()
  draft.value = { logic: props.modelValue.logic, conditions: props.modelValue.conditions.map(condition => ({ ...condition, values: [...condition.values] })) }
  validationError.value = ''
  void load()
}, { immediate: true })
watch(() => props.visible, visible => {
  if (!visible) return
  draft.value = { logic: props.modelValue.logic, conditions: props.modelValue.conditions.map(condition => ({ ...condition, values: [...condition.values] })) }
  validationError.value = ''
  defaults()
}, { immediate: true })
function outside(event: PointerEvent) {
  if (!props.visible || !(event.target instanceof Element)) return
  const target = event.target
  if (form.value?.contains(target) || props.anchor?.contains(target) || target.closest('.performance-select-shell__popup, .performance-datetime-panel, .member-filter-date-popup, [data-member-filter-layer]')) return
  emit('close')
}
onMounted(() => document.addEventListener('pointerdown', outside))
onBeforeUnmount(() => { ++sequence; document.removeEventListener('pointerdown', outside) })
function changeField(index: number, key: string) {
  const field = fields.value.find(item => item.key === key)
  if (!field) return
  const previous = fieldFor(draft.value.conditions[index])
  const preserve = previous?.kind === 'sequence' && field.kind === 'sequence'
  draft.value.conditions[index] = { key: field.key, op: field.operators[0].value, values: preserve ? [...draft.value.conditions[index].values] : [] }
}
async function add() {
  if (draft.value.conditions.length >= 30) return
  draft.value.conditions.push({ key: '', op: 'in', values: [] })
  await nextTick()
  fieldControls.value[fieldControls.value.length - 1]?.open()
}
function apply() {
  validationError.value = ''
  for (const condition of completeFilters.value.conditions) {
    const field = fieldFor(condition)
    if (!field || !field.operators.some(operator => operator.value === condition.op)) { validationError.value = '筛选配置已变化，请重新选择条件'; return }
  }
  emit('apply', completeFilters.value)
  emit('close')
}
</script>

<template>
  <PerformancePopover :visible="visible" :anchor="anchor" width="var(--performance-member-filter-width)" align="end" side="bottom" role="dialog" name="member-advanced-filter" aria-label="成员筛选" content-class="member-filter-popover-content" @close="emit('close')">
    <form ref="form" class="member-filter" novalidate @submit.prevent="apply">
      <div class="member-filter__header">
        <div class="member-filter__relation"><span>符合以下</span><PerformanceSearchSelect :model-value="draft.logic" :options="relationOptions" selection-style="plain" aria-label="条件关系" @update:model-value="draft.logic = $event === 'or' ? 'or' : 'and'" /><span>条件</span></div>
        <PerformanceMemberFilterPresets :cycle-id="cycleId" :context-key="contextKey" :visible="visible" :filters="completeFilters" :disabled="loading || !!error" @select="draft = $event" />
      </div>
      <p v-if="loading && !fields.length" role="status">正在加载筛选条件…</p>
      <p v-else-if="error" role="alert">{{ error }} <UiButton variant="text" @click="load">重试</UiButton></p>
      <p v-else-if="!fields.length" role="status">当前范围暂无可用筛选条件</p>
      <div v-else class="member-filter__rows">
        <div v-for="(condition, index) in draft.conditions" :key="index" class="member-filter__row">
          <PerformanceMemberFilterField ref="fieldControls" :model-value="condition.key" :fields="fields" :ariaLabel="`条件${index + 1}字段`" @update:model-value="changeField(index, $event)" />
          <PerformanceSearchSelect :model-value="condition.key ? condition.op : null" :options="fieldFor(condition)?.operators || []" :disabled="!fieldFor(condition)" :aria-label="`条件${index + 1}操作符`" selection-style="plain" @update:model-value="condition.op = $event as PerformanceMemberFilterCondition['op']" />
          <PerformanceMemberFilterValue v-if="fieldFor(condition)" :key="`${contextKey}:${condition.key}:${index}`" v-model="condition.values" :field="fieldFor(condition)!" :cycle-id="cycleId" @options-loaded="rememberCandidates(condition.key, $event)" />
          <PerformanceSearchSelect v-else :model-value="null" disabled :aria-label="`条件${index + 1}取值`" />
          <PerformanceIconButton icon="DeleteTrashOutlined" :label="`删除条件${index + 1}`" @click="draft.conditions.splice(index, 1)" />
        </div>
      </div>
      <p v-if="validationError" role="alert" class="member-filter__error">{{ validationError }}</p>
      <div class="member-filter__footer">
        <UiButton variant="text" :disabled="loading || !!error || !fields.length || draft.conditions.length >= 30" @click="add">＋ 添加条件</UiButton>
        <div class="member-filter__actions">
          <UiButton size="small" variant="text" :disabled="!completeFilters.conditions.length" @click="draft.conditions = []">清除已选内容</UiButton>
          <UiButton size="small" @click="emit('close')">取消</UiButton>
          <UiButton size="small" variant="primary" type="submit" :disabled="loading || !!error || !fields.length">确定</UiButton>
        </div>
      </div>
    </form>
  </PerformancePopover>
</template>

<style scoped>
.member-filter{container-type:inline-size;display:flex;flex-direction:column;gap:var(--spacing-2);padding:var(--spacing-2);font-size:var(--font-size-md);line-height:var(--performance-popover-line-height)}
.member-filter__header,.member-filter__relation{display:flex;align-items:center;gap:var(--spacing-2)}
.member-filter__header{justify-content:space-between;margin-bottom:var(--spacing-2)}
.member-filter__relation{white-space:nowrap}
.member-filter__relation>:nth-child(2){width:var(--performance-button-min-width)}
.member-filter__relation :deep(.performance-select-shell__selector){height:var(--performance-button-height-small);border-color:transparent}
.member-filter__rows{display:flex;flex-direction:column;gap:var(--spacing-2)}
.member-filter__row{display:grid;grid-template-columns:var(--performance-member-filter-field-width) var(--performance-member-filter-operator-width) var(--performance-member-filter-value-width) var(--performance-icon-button-size);align-items:center;gap:var(--spacing-2)}
.member-filter__row>*{min-width:0}
.member-filter__footer,.member-filter__actions{display:flex;align-items:center;justify-content:space-between;gap:var(--spacing-3);flex-wrap:wrap}
.member-filter__actions :deep(.performance-button.is-small),.member-filter__header :deep(.performance-button.is-small){height:var(--performance-button-height-small);min-width:var(--performance-member-filter-action-width);padding-inline:var(--spacing-2);font-size:var(--font-size-sm);line-height:var(--performance-button-height-small);border-radius:var(--radius-md)}
.member-filter__actions :deep(.performance-button--text){min-width:0}
.member-filter__error{margin:0;color:var(--color-danger)}
:global(.member-filter-popover-content){padding:var(--spacing-3) var(--spacing-3)}
@container (max-width: 40rem){.member-filter__row{grid-template-columns:minmax(0,1fr) var(--performance-member-filter-operator-width) var(--performance-icon-button-size)}.member-filter__row>:nth-child(3){grid-row:2;grid-column:1/3}.member-filter__row>:last-child{grid-row:1/3;grid-column:3}.member-filter__header{flex-wrap:wrap}}
</style>
