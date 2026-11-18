<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { PerformanceCalibrationAssignment, PerformanceCalibrationDetails, PerformanceProjectPayload, PerformanceHrbpOrganizationNode } from '@/api/performance'
import { performanceProjectApi } from '@/api/performance'
import UiFullScreenModal from '@/components/ui/UiFullScreenModal.vue'
import UiSurface from '@/components/ui/UiSurface.vue'
import UiButton from '@/components/ui/UiButton.vue'
import PerformanceFilterButton from './PerformanceFilterButton.vue'
import PerformanceExportButton from './PerformanceExportButton.vue'
import PerformanceCalibrationDetailTable from './PerformanceCalibrationDetailTable.vue'
import PerformanceCalibrationDetailFilter from './PerformanceCalibrationDetailFilter.vue'
import PerformanceCalibrationPeopleScreen from './PerformanceCalibrationPeopleScreen.vue'

const props = defineProps<{ modelValue: boolean; projectId: number | null; nodeId: string; payload: PerformanceProjectPayload | null; stats: PerformanceCalibrationAssignment | null; organizations: PerformanceHrbpOrganizationNode[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const details = ref<PerformanceCalibrationDetails | null>(null)
const loading = ref(false)
const error = ref('')
const filterAnchor = ref<HTMLElement | null>(null)
const filterOpen = ref(false)
const peopleOpen = ref(false)
const calibratorFilter = ref<string[]>([])
const revieweeFilter = ref<string[]>([])
let request = 0
const calibrators = computed(() => [...new Set(details.value?.phases.flatMap(phase => phase.assignments.map(item => item.handler_ref)) || [])])
const peopleById = computed(() => new Map(details.value?.people.map(person => [person.employee_no, person]) || []))
const assignedIds = computed(() => new Set(details.value?.phases.flatMap(phase => phase.assignments.map(item => item.employee_no)) || []))
const unassignedPeople = computed(() => (details.value?.evaluated_employee_nos || []).filter(id => !assignedIds.value.has(id)).map(id => peopleById.value.get(id) || { employee_no: id, display_name: id, direct_supervisor_name: null, dotted_supervisor_name: null, department: null, leaf_department: null, job_family: null, job_category: null, standard_position: null, employment_status: null }))
const personName = (id: string) => peopleById.value.get(id)?.display_name || id
const calibratorOptions = computed(() => calibrators.value.map(value => ({ value, label: personName(value) })))
const revieweeOptions = computed(() => (details.value?.evaluated_employee_nos || []).map(value => ({ value, label: personName(value) })))
const stats = computed(() => details.value || props.stats)
async function load() {
  const current = ++request
  details.value = null
  error.value = ''
  if (!props.projectId || !props.payload) { error.value = '请先保存项目，再查看校准详情'; return }
  loading.value = true
  try {
    const response = await performanceProjectApi.calibrationDetails(props.projectId, props.payload)
    if (current !== request) return
    details.value = response[props.nodeId] || null
    if (!details.value) error.value = '当前环节暂无校准分配'
  } catch (cause: any) {
    if (current === request) error.value = typeof cause?.response?.data?.detail === 'string' ? cause.response.data.detail : '校准详情加载失败，请稍后重试'
  } finally { if (current === request) loading.value = false }
}
watch(() => props.modelValue, open => {
  filterOpen.value = false; peopleOpen.value = false
  if (!open) { request++; loading.value = false; return }
  calibratorFilter.value = []; revieweeFilter.value = []
  void load()
}, { immediate: true })
onBeforeUnmount(() => { request++ })
function toggleFilter() { filterAnchor.value = document.querySelector<HTMLElement>('.calibration-detail-screen .filter-button'); filterOpen.value = !filterOpen.value }
function applyFilter(calibratorsValue: string[], revieweesValue: string[]) { calibratorFilter.value = calibratorsValue; revieweeFilter.value = revieweesValue }
async function exportRows() {
  const rows = [['阶段', '校准规则', '校准人', '人数', '校准范围']]
  details.value?.phases.forEach((phase, phaseIndex) => {
    const sources = phase.rule_sources ?? [{ rule_id: '', assignments: phase.assignments }]
    sources.forEach((source, ruleIndex) => {
      const handlers = new Map<string, Set<string>>()
      source.assignments.forEach(item => {
        if (calibratorFilter.value.length && !calibratorFilter.value.includes(item.handler_ref) || revieweeFilter.value.length && !revieweeFilter.value.includes(item.employee_no)) return
        if (!handlers.has(item.handler_ref)) handlers.set(item.handler_ref, new Set())
        handlers.get(item.handler_ref)!.add(item.employee_no)
      })
      handlers.forEach((members, handler) => rows.push([`第 ${phaseIndex + 1} 阶段`, phase.rule_sources ? `校准规则 ${ruleIndex + 1}` : '历史阶段分配', personName(handler), String(members.size), [...members].map(personName).join('、')]))
    })
  })
  return rows
}
</script>

<template>
  <UiFullScreenModal v-if="modelValue" class="calibration-detail-screen" title="校准详情" :show-footer="false" content-scroll="page" @back="emit('update:modelValue', false)">
    <div class="calibration-detail-content">
      <div class="calibration-detail-toolbar">
        <strong v-if="stats">{{ stats.assigned_count }} 人已分配给 {{ details ? calibrators.length : '—' }} 个校准人校准（共 {{ stats.evaluated_count }} 个被评估人，<button class="unassigned-count" type="button" :disabled="!details || !stats.unassigned_count" @click="peopleOpen = true">{{ stats.unassigned_count }}</button> 人未分配校准人）</strong>
        <strong v-else>正在加载校准详情…</strong>
        <div class="calibration-detail-actions"><PerformanceFilterButton :disabled="loading || !details" @click="toggleFilter" /><PerformanceExportButton :load-rows="exportRows" filename="校准详情" :disabled="loading || !details" @error="error = '导出失败，请重试'" /></div>
      </div>
      <UiSurface class="calibration-detail-surface" radius="all" min-width="0">
        <div v-if="error" class="calibration-detail-error" role="alert">{{ error }} <UiButton v-if="projectId && payload" variant="link" @click="load">重新加载</UiButton></div>
        <PerformanceCalibrationDetailTable :details="details" :loading="loading" :error="error" :calibrators="calibratorFilter" :reviewees="revieweeFilter" :organizations="organizations" />
      </UiSurface>
    </div>
    <PerformanceCalibrationDetailFilter :visible="filterOpen" :anchor="filterAnchor" :calibrators="calibratorFilter" :reviewees="revieweeFilter" :calibrator-options="calibratorOptions" :reviewee-options="revieweeOptions" @close="filterOpen = false" @apply="applyFilter" />
    <PerformanceCalibrationPeopleScreen v-if="peopleOpen" :people="unassignedPeople" @close="peopleOpen = false" />
  </UiFullScreenModal>
</template>

<style scoped>
.calibration-detail-screen{width:100vw;right:auto;--ui-fullscreen-background:var(--ui-page-background);--performance-fullscreen-content-bottom-space:0px}
.calibration-detail-content{flex:1 0 auto;min-width:0;width:100%;padding:0 var(--spacing-5) var(--spacing-5);box-sizing:border-box}
.calibration-detail-screen :deep(.full-screen-modal-header){padding-left:var(--spacing-5);border-bottom:1px solid var(--color-line-header)}
.calibration-detail-toolbar{display:flex;align-items:center;justify-content:space-between;min-height:72px;gap:var(--spacing-6);color:var(--color-text-primary);font-size:var(--font-size-md);line-height:var(--ui-table-line-height)}
.calibration-detail-toolbar strong{font-weight:600}
.unassigned-count{padding:0;border:0;background:transparent;color:var(--color-primary-hover);font:inherit;cursor:pointer}.unassigned-count:disabled{cursor:default}
.calibration-detail-actions{display:flex;flex:none;align-items:center;gap:var(--spacing-3)}
.calibration-detail-surface{width:100%;box-sizing:border-box}
.calibration-detail-error{margin-bottom:var(--spacing-3);color:var(--performance-field-error-color);font-size:var(--font-size-md);line-height:22px}
@media(max-width:800px){.calibration-detail-toolbar{flex-wrap:wrap;padding-block:var(--spacing-3);gap:var(--spacing-3)}.calibration-detail-actions{margin-left:auto}}
</style>
