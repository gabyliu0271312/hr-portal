<template>
  <div class="performance-task-table-wrap">
    <div class="performance-task-table-scroll">
      <table class="performance-task-table">
        <colgroup>
          <col class="selection-column" />
          <col v-for="column in columns" :key="column.key" :style="{ minWidth: `${column.minWidth || 120}px` }" />
        </colgroup>
        <thead>
          <tr>
            <th class="selection-cell"><PerformanceCheckbox :model-value="allSelected" :disabled="!rows.length || loading" label="全选被评估人" @update:model-value="toggleAll" /></th>
            <th v-for="column in columns" :key="column.key">{{ column.label }}</th>
          </tr>
        </thead>
        <tbody v-if="loading || error || !rows.length">
          <tr><td class="state-cell" :colspan="columns.length + 1"><div v-if="loading" class="table-state" role="status">正在加载成员…</div><div v-else-if="error" class="table-state table-state--error" role="alert">{{ error }}<button type="button" @click="emit('retry')">重新加载</button></div><div v-else class="table-state">暂无未完成的被评估人</div></td></tr>
        </tbody>
        <tbody v-else>
          <tr v-for="row in rows" :key="row.task_id">
            <td class="selection-cell"><PerformanceCheckbox :model-value="selectedKeys.includes(String(row.task_id))" :disabled="loading" :label="`选择${row.display_name}`" @update:model-value="toggleRow(row, $event)" /></td>
            <td v-for="column in columns" :key="column.key" :class="{ 'name-cell': column.key === 'display_name' }"><span class="cell-text" :title="String(reminderCellValue(row, column.key))">{{ reminderCellValue(row, column.key) }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
    <PerformancePagination :page="page" :page-size="pageSize" :total="total" @page-change="emit('page-change', $event)" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import PerformanceCheckbox from './PerformanceCheckbox.vue'
import PerformancePagination from './PerformancePagination.vue'
import { reminderCellValue, type ReminderColumn, type ReminderPerson } from './performanceReminder'

const props = withDefaults(defineProps<{ rows: ReminderPerson[]; columns: ReminderColumn[]; selectedKeys: string[]; loading: boolean; error?: string; total: number; page: number; pageSize: number }>(), { error: '' })
const emit = defineEmits<{ 'update:selectedKeys': [keys: string[]]; retry: []; 'page-change': [page: number] }>()
const allSelected = computed(() => props.rows.length > 0 && props.rows.every(row => props.selectedKeys.includes(String(row.task_id))))

function toggleAll(value: boolean) {
  const pageKeys = props.rows.map(row => String(row.task_id))
  const next = value ? Array.from(new Set([...props.selectedKeys, ...pageKeys])) : props.selectedKeys.filter(key => !pageKeys.includes(key))
  emit('update:selectedKeys', next)
}

function toggleRow(row: ReminderPerson, value: boolean) {
  const key = String(row.task_id)
  const next = value ? Array.from(new Set([...props.selectedKeys, key])) : props.selectedKeys.filter(item => item !== key)
  emit('update:selectedKeys', next)
}
</script>

<style scoped>
.performance-task-table-wrap{min-width:0}.performance-task-table-scroll{overflow:auto}.performance-task-table{width:100%;min-width:1280px;border-collapse:separate;border-spacing:0;table-layout:fixed;color:#1f2329;font-size:14px}.performance-task-table col.selection-column{width:40px}.performance-task-table th{height:47px;padding:12px;border-bottom:1px solid rgba(31,35,41,.15);background:#fff;color:#646a73;font-weight:400;line-height:22px;text-align:left;white-space:nowrap}.performance-task-table td{height:52px;padding:0 12px;border-bottom:1px solid rgba(31,35,41,.08);background:#fff;vertical-align:middle;white-space:nowrap}.performance-task-table tr:hover td{background:#f5f6f7}.performance-task-table .selection-cell{width:40px;padding:0 12px}.selection-cell :deep(.performance-checkbox__label){display:none}.cell-text{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.name-cell .cell-text{font-weight:400}.state-cell{height:220px!important;padding:0!important;text-align:center}.table-state{display:grid;place-items:center;gap:8px;color:#646a73}.table-state--error{color:#d14343}.table-state button{padding:4px 8px;border:0;border-radius:6px;background:transparent;color:#1456f0;cursor:pointer;font:inherit}
</style>
