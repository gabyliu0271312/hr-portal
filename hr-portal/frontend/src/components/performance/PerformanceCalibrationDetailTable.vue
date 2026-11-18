<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PerformanceCalibrationAssignmentRow, PerformanceCalibrationDetails, PerformanceProjectFlowRule, PerformanceHrbpOrganizationNode } from '@/api/performance'
import UiTable from '@/components/ui/UiTable.vue'
import PerformanceMemberIdentity from './PerformanceMemberIdentity.vue'
import PerformanceCompactPeople from './PerformanceCompactPeople.vue'
import { summarizeCalibrationRule } from './performanceCalibrationRuleSummary'

const props = defineProps<{
  details: PerformanceCalibrationDetails | null
  loading: boolean
  error: string
  calibrators: string[]
  reviewees: string[]
  organizations: PerformanceHrbpOrganizationNode[]
}>()
const collapsed = ref<Record<string, boolean>>({})
const limits = ref<Record<string, number>>({})
const people = computed(() => new Map(props.details?.people.map(person => [person.employee_no, person]) || []))
const summaryPeople = computed(() => (props.details?.people || []).map(person => ({ value: person.employee_no, label: person.display_name || person.employee_no, display_name: person.display_name })))
const name = (id: string) => people.value.get(id)?.display_name || '人员信息不可用'
function summarize(rule: PerformanceProjectFlowRule, subject = false) {
  return summarizeCalibrationRule(rule, { subject, peopleOptions: summaryPeople.value, organizationTree: props.organizations })
}
function byHandler(assignments: PerformanceCalibrationAssignmentRow[]) {
  const result = new Map<string, Set<string>>()
  assignments.forEach(item => {
    if (props.calibrators.length && !props.calibrators.includes(item.handler_ref)) return
    if (props.reviewees.length && !props.reviewees.includes(item.employee_no)) return
    if (!result.has(item.handler_ref)) result.set(item.handler_ref, new Set())
    result.get(item.handler_ref)!.add(item.employee_no)
  })
  return Array.from(result, ([handler, members]) => ({ handler, members: [...members] }))
}
const groups = computed(() => props.details?.phases.flatMap((phase, phaseIndex) => {
  const sources = phase.rule_sources
  const items = sources?.map((source, ruleIndex) => ({ id: `${phase.phase_id}/${source.rule_id}`, label: `第 ${phaseIndex + 1} 阶段 - 校准规则 ${ruleIndex + 1}`, rule: source.rule, assignments: source.assignments }))
    ?? [{ id: phase.phase_id, label: `第 ${phaseIndex + 1} 阶段`, rule: null, assignments: phase.assignments }]
  return items.map(source => {
    const handlers = byHandler(source.assignments)
    return { ...source, handlers, count: new Set(handlers.flatMap(handler => handler.members)).size }
  })
    .filter(group => group.handlers.length || !props.calibrators.length && !props.reviewees.length)
}) || [])
const rows = computed(() => groups.value.flatMap(group => {
  const items: Array<{ id: string; kind: 'group' | 'person' | 'more'; group: typeof group; handler?: string; members?: string[] }> = [{ id: group.id, kind: 'group', group }]
  if (!collapsed.value[group.id]) {
    const limit = limits.value[group.id] || 5
    group.handlers.slice(0, limit).forEach(handler => items.push({ id: `${group.id}/${handler.handler}`, kind: 'person', group, ...handler }))
    if (group.handlers.length > limit) items.push({ id: `${group.id}/more`, kind: 'more', group })
  }
  return items
}))
const columns = [{ key: 'handler', label: '校准人', width: 300 }, { key: 'count', label: '人数', width: 300 }, { key: 'members', label: '校准范围', width: 380 }]
</script>

<template>
  <UiTable class="calibration-detail-table" :columns="columns" :rows="rows" :loading="loading" :empty-text="error || '暂无校准分配'" loading-text="正在加载校准详情…" aria-label="校准详情" :min-width="980">
    <template #row="{ row }">
      <tr v-if="row.kind === 'group'" class="calibration-group-row">
        <td colspan="3" class="ui-table__cell calibration-group-cell">
          <div class="calibration-group-content">
            <button type="button" class="calibration-group-toggle" :aria-label="`${collapsed[row.id] ? '展开' : '收起'}${row.group.label}`" :aria-expanded="!collapsed[row.id]" @click="collapsed[row.id] = !collapsed[row.id]">
              <svg viewBox="0 0 24 24" :class="{ collapsed: collapsed[row.id] }" aria-hidden="true"><path d="M4 8h16l-8 10z" fill="currentColor" /></svg>
            </button>
            <strong>{{ row.group.label }} &nbsp;(校准人 {{ row.group.handlers.length }} 人，被评估人 {{ row.group.count }} 人)</strong>
            <span v-if="row.group.rule" class="calibration-group-description" :title="`校准人：${summarize(row.group.rule, true)}　校准范围：${summarize(row.group.rule)}`">校准人：{{ summarize(row.group.rule, true) }}　校准范围：{{ summarize(row.group.rule) }}</span>
            <span v-else class="calibration-group-description">历史快照未保留规则来源，按阶段展示</span>
          </div>
        </td>
      </tr>
      <tr v-else-if="row.kind === 'person'" class="calibration-person-row">
        <td class="ui-table__cell calibration-person-cell"><PerformanceMemberIdentity :display-name="name(row.handler)" size="sm" :dimission="people.get(row.handler)?.employment_status === '离职'" /></td>
        <td class="ui-table__cell">{{ row.members.length }}</td>
        <td class="ui-table__cell calibration-scope-cell"><PerformanceCompactPeople :people="row.members.map((id: string) => ({ employee_no: id, display_name: name(id) }))" /></td>
      </tr>
      <tr v-else class="calibration-more-row">
        <td colspan="3" class="ui-table__cell"><button class="calibration-more" type="button" @click="limits[row.group.id] = (limits[row.group.id] || 5) + 5">展开更多（{{ row.group.handlers.length - (limits[row.group.id] || 5) }}）</button></td>
      </tr>
    </template>
  </UiTable>
</template>

<style scoped>
.calibration-detail-table{--ui-table-header-background:var(--color-surface-card);--ui-table-header-height:47px;--ui-table-row-height:55px}
.calibration-detail-table :deep(col:nth-child(1)),.calibration-detail-table :deep(col:nth-child(2)){width:300px!important}
.calibration-detail-table :deep(col:nth-child(3)){width:auto!important}
.calibration-detail-table :deep(th:first-child){padding-left:30px}
.calibration-detail-table :deep(th:last-child){padding-left:0}
.calibration-detail-table :deep(.ui-table__cell){height:55px;padding:12px;border-bottom:1px solid var(--ui-table-border-color);color:var(--ui-table-text-color);font-size:14px;line-height:22px;text-align:left;font-weight:400;box-sizing:border-box}
.calibration-detail-table :deep(th.ui-table__cell){height:47px;color:var(--ui-table-header-color);font-weight:500}
.calibration-group-row{background:var(--performance-review-readonly-surface)}
.calibration-detail-table .calibration-group-cell{height:44px;padding:10px 12px;background:var(--performance-review-readonly-surface)}
.calibration-group-content{display:flex;align-items:center;min-width:0;height:23px}
.calibration-group-content strong{flex:none;font-weight:600;font-size:14px;white-space:nowrap}
.calibration-group-description{min-width:0;margin-left:16px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:var(--performance-text-secondary)}
.calibration-group-toggle{display:flex;align-items:center;justify-content:center;flex:none;width:16px;height:16px;margin-right:4px;padding:3px;border:0;border-radius:4px;background:transparent;color:var(--performance-text-secondary);cursor:pointer}
.calibration-group-toggle:hover{background:var(--performance-interactive-hover-background)}
.calibration-group-toggle svg{width:10px;height:10px}.calibration-group-toggle svg.collapsed{transform:rotate(-90deg)}
.calibration-detail-table .calibration-person-cell{padding-left:32px}
.calibration-person-cell :deep(.member-name){max-width:200px}
.calibration-detail-table .calibration-scope-cell{padding-left:0}
.calibration-person-row:hover{background:var(--ui-table-row-hover-background)}
.calibration-detail-table .calibration-more-row td{height:47px}
.calibration-more{padding:0;border:0;background:transparent;color:var(--color-primary);font:inherit;cursor:pointer}
.calibration-more:focus-visible,.calibration-group-toggle:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}
</style>
