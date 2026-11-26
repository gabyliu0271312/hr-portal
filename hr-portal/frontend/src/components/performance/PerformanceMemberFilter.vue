<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { projectManagementApi, type PerformanceMemberFilterOption, type PerformanceMemberFilterCondition, type PerformanceMemberFilterField, type PerformanceMemberFilters } from '@/api/performance'
import PerformancePopover from './PerformancePopover.vue'
import PerformanceSearchSelect from './PerformanceSearchSelect.vue'
import PerformanceMemberFilterValue from './PerformanceMemberFilterValue.vue'
import UiButton from '@/components/ui/UiButton.vue'

const props = defineProps<{ visible: boolean; anchor: HTMLElement | null; cycleId: number; modelValue: PerformanceMemberFilters; contextKey: string }>()
const emit = defineEmits<{ close: []; apply: [filters: PerformanceMemberFilters] }>()
const fields = ref<PerformanceMemberFilterField[]>([])
const candidateCache = new Map<string, PerformanceMemberFilterOption[]>()
watch(() => [props.contextKey, props.cycleId], () => candidateCache.clear())
function rememberCandidates(key: string, options: PerformanceMemberFilterOption[]) { candidateCache.set(key, options) }
const draft = ref<PerformanceMemberFilters>({ logic: 'and', conditions: [] })
const loading = ref(false)
const error = ref('')
const validationError = ref('')
let sequence = 0
const fieldOptions = computed(() => fields.value.map(field => ({ value: field.key, label: field.label })))
const relationOptions = [{ value: 'and', label: '所有' }, { value: 'or', label: '任意' }]
const fieldFor = (condition: PerformanceMemberFilterCondition) => fields.value.find(field => field.key === condition.key)
async function load() {
  const request = ++sequence
  loading.value = true
  error.value = ''
  try {
    const result = await projectManagementApi.cycleMemberFilterOptions(props.cycleId)
    if (request === sequence) {
      fields.value = result.fields.map(field => field.kind === 'person' ? { ...field, options: candidateCache.get(field.key) || [] } : field)
      if (!draft.value.conditions.length) {
        const defaults = ['direct_supervisor', 'department_path', 'department', 'position_level', 'job_sequence', 'name']
        draft.value.conditions = defaults.flatMap(key => {
          const field = fields.value.find(item => item.key === key)
          return field ? [{ key, op: field.operators[0].value, values: [] }] : []
        })
      }
    }
  } catch (cause: any) {
    if (request === sequence) error.value = cause?.response?.status === 403 ? '你没有当前成员范围的筛选权限' : '筛选条件加载失败，请重试'
  } finally { if (request === sequence) loading.value = false }
}
watch(() => [props.visible, props.cycleId, props.contextKey], () => {
  ++sequence
  if (!props.visible) return
  draft.value = { logic: props.modelValue.logic, conditions: props.modelValue.conditions.map(condition => ({ ...condition, values: [...condition.values] })) }
  fields.value = []
  validationError.value = ''
  void load()
}, { immediate: true })
onBeforeUnmount(() => { ++sequence })
function changeField(index: number, value: string | string[] | null) {
  const field = fields.value.find(item => item.key === value)
  if (field) draft.value.conditions[index] = { key: field.key, op: field.operators[0].value, values: [] }
}
function add() {
  const field = fields.value.find(item => !draft.value.conditions.some(condition => condition.key === item.key)) || fields.value[0]
  if (field && draft.value.conditions.length < 30) draft.value.conditions.push({ key: field.key, op: field.operators[0].value, values: [] })
}
function apply() {
  validationError.value = ''
  const conditions = draft.value.conditions.filter(condition => condition.values.some(Boolean))
  for (const condition of conditions) {
    const field = fieldFor(condition)
    if (!field || !field.operators.some(operator => operator.value === condition.op)) { validationError.value = '筛选配置已变化，请重新选择条件'; return }
    if (field.kind === 'date' && (condition.values.length !== 2 || !condition.values.every(Boolean) || condition.values[0] > condition.values[1])) { validationError.value = `${field.label}请选择有效的开始和结束日期`; return }
  }
  emit('apply', { logic: draft.value.logic, conditions: conditions.map(condition => ({ ...condition, values: [...condition.values] })) })
  emit('close')
}
</script>

<template>
  <PerformancePopover :visible="visible" :anchor="anchor" width="var(--performance-member-filter-width)" align="end" side="bottom" role="dialog" name="member-advanced-filter" aria-label="成员筛选" @close="emit('close')">
    <form class="member-filter" @submit.prevent="apply">
      <div class="member-filter__header"><span>符合以下</span><PerformanceSearchSelect :model-value="draft.logic" :options="relationOptions" selection-style="plain" aria-label="条件关系" @update:model-value="draft.logic = $event === 'or' ? 'or' : 'and'" /><span>条件</span></div>
      <p v-if="loading" role="status">正在加载筛选条件…</p>
      <p v-else-if="error" role="alert">{{ error }} <UiButton variant="text" @click="load">重试</UiButton></p>
      <p v-else-if="!fields.length" role="status">当前范围暂无可用筛选条件</p>
      <div v-else class="member-filter__rows">
        <div v-for="(condition, index) in draft.conditions" :key="index" class="member-filter__row">
          <PerformanceSearchSelect :model-value="condition.key" :options="fieldOptions" :aria-label="`条件${index + 1}字段`" selection-style="plain" @update:model-value="changeField(index, $event)" />
          <PerformanceSearchSelect :model-value="condition.op" :options="fieldFor(condition)?.operators || []" :aria-label="`条件${index + 1}操作符`" selection-style="plain" @update:model-value="condition.op = $event as PerformanceMemberFilterCondition['op']" />
          <PerformanceMemberFilterValue v-if="fieldFor(condition)" :key="`${contextKey}:${condition.key}:${index}`" v-model="condition.values" :field="fieldFor(condition)!" :cycle-id="cycleId" @options-loaded="rememberCandidates(condition.key, $event)" />
          <UiButton variant="text" :aria-label="`删除条件${index + 1}`" @click="draft.conditions.splice(index, 1)">删除</UiButton>
        </div>
      </div>
      <p v-if="validationError" role="alert" class="member-filter__error">{{ validationError }}</p>
      <div class="member-filter__footer">
        <UiButton variant="text" :disabled="loading || !!error || !fields.length || draft.conditions.length >= 30" @click="add">＋ 添加条件</UiButton>
        <div class="member-filter__actions">
          <UiButton variant="text" :disabled="!draft.conditions.some(condition => condition.values.some(Boolean))" @click="draft.conditions.forEach(condition => condition.values = [])">清除已选内容</UiButton>
          <UiButton @click="emit('close')">取消</UiButton>
          <UiButton variant="primary" type="submit" :disabled="loading || !!error || !fields.length">确定</UiButton>
        </div>
      </div>
    </form>
  </PerformancePopover>
</template>

<style scoped>
.member-filter{container-type:inline-size;display:flex;flex-direction:column;gap:var(--spacing-4);padding:var(--spacing-2);font-size:var(--font-size-md);line-height:var(--performance-popover-line-height)}
.member-filter__header{display:flex;align-items:center;gap:var(--spacing-2)}
.member-filter__header>:nth-child(2){width:var(--performance-member-filter-operator-width)}
.member-filter__rows{display:flex;flex-direction:column;gap:var(--spacing-2)}
.member-filter__row{display:grid;grid-template-columns:minmax(0, var(--performance-member-filter-field-width)) var(--performance-member-filter-operator-width) minmax(0,1fr) auto;align-items:start;gap:var(--spacing-2)}
.member-filter__row>*{min-width:0}
.member-filter__footer,.member-filter__actions{display:flex;align-items:center;justify-content:space-between;gap:var(--spacing-3);flex-wrap:wrap}
.member-filter__error{margin:0;color:var(--color-danger)}
@container (max-width: 40rem){.member-filter__row{grid-template-columns:minmax(0,1fr) var(--performance-member-filter-operator-width)}.member-filter__row>:nth-child(3){grid-column:1/-1}}
</style>
