<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import { employeeSwitchEpoch } from '@/stores/identitySwitch'
import type { PerformanceMemberColumnSchema, PerformanceReviewMemberContext, PerformanceReviewNode } from '@/api/performance'
import { calibrationReviewNode, performanceCalibrationApi, type CalibrationMember, type CalibrationPeopleQuery, type PerformanceCalibrationTaskScope } from '@/api/performanceCalibration'
import { sortPerformanceRows } from '../performanceTableSort'
import ProjectMemberListPanel from '../ProjectMemberListPanel.vue'

const props = defineProps<{ tasks: PerformanceCalibrationTaskScope[]; cycleId: number }>()
const emit = defineEmits<{ 'open-member': [payload: { node: PerformanceReviewNode; member: PerformanceReviewMemberContext }] }>()
let generation = 0
onBeforeUnmount(() => { generation++ })
const taskKey = computed(() => JSON.stringify([props.cycleId, employeeSwitchEpoch.value, props.tasks.map(task => task.scope_key)]))
watch(taskKey, () => { generation++ }, { flush: 'sync' })
const identity = (member: CalibrationMember) => JSON.stringify([member.project_id, member.employee_no])
const provider = computed(() => {
  const tasks = [...props.tasks]
  return async (query: CalibrationPeopleQuery) => {
    const request = ++generation
    const members = new Map<string, CalibrationMember>()
    const schemas: Partial<PerformanceMemberColumnSchema>[] = []
    for (const scope of tasks) {
      let page = 1
      let count = 0
      let total: number | undefined
      do {
        const result = await performanceCalibrationApi.members(scope, { keyword: query.keyword, page, pageSize: 100 })
        if (request !== generation) throw new Error('CALIBRATION_SCOPE_CHANGED')
        if (!Number.isInteger(result.total) || result.total < 0 || total !== undefined && total !== result.total) throw new Error('CALIBRATION_PEOPLE_INCOMPLETE')
        total = result.total
        if (!result.items.length && count < total || count + result.items.length > total) throw new Error('CALIBRATION_PEOPLE_INCOMPLETE')
        for (const member of result.items) {
          const key = identity(member)
          const row = { ...member, root_review_id: member.root_review_id || member.task_id || member.id }
          const existing = members.get(key)
          if (!existing || existing.status === 'completed' && member.status !== 'completed') members.set(key, row)
        }
        schemas.push(result)
        count += result.items.length
        page++
      } while (count < total)
    }
    const columns = new Map(schemas.flatMap(schema => schema.columns || []).map(column => [column.key, column]))
    const allowed = new Set(['name', ...schemas.flatMap(schema => schema.allowed_column_keys || [])])
    const ratings = new Map(schemas.flatMap(schema => ('rating_columns' in schema ? schema.rating_columns as Array<{ key: string; label: string }> : []) || []).map(column => [column.key, column]))
    const rows = sortPerformanceRows([...members.values()], query.sortBy || 'name', query.sortOrder || 'asc', (member, sort) => {
      if (sort === 'name') return member.display_name
      if (sort === 'completion') {
        const [completed, count] = (member.completion || '0/0').split('/').map(Number)
        return count ? completed / count : 0
      }
      return member.column_values?.[sort] ?? member.ratings?.[sort]?.label ?? member[sort as keyof CalibrationMember]
    })
    return {
      columns: [...columns.values()],
      allowed_column_keys: [...allowed],
      locked_column_keys: ['name'],
      default_column_keys: [...new Set(schemas.flatMap(schema => schema.default_column_keys || []))],
      sort_keys: [...allowed],
      rating_columns: [...ratings.values()],
      items: rows.slice((query.page - 1) * query.pageSize, query.page * query.pageSize),
      total: rows.length,
    }
  }
})
function openMember(member: CalibrationMember) {
  const scope = props.tasks.find(task => task.scope_key === member.scope_key)
  if (scope) emit('open-member', { node: calibrationReviewNode(scope), member })
}
</script>

<template>
  <section class="calibration-all-people" aria-label="全部被校准人">
    <ProjectMemberListPanel :key="taskKey" :project-id="0" :cycle-id="cycleId" readonly :show-export="false" :provider="provider" @select-member="openMember($event as CalibrationMember)" />
  </section>
</template>

<style scoped>
.calibration-all-people { min-width: 0; }
</style>
