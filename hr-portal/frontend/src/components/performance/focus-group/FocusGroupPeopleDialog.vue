<script setup lang="ts">
import type { PerformanceFocusGroupChangePerson } from '@/api/performance'
import PerformanceDialogShell from '../PerformanceDialogShell.vue'
import UiTable from '@/components/ui/UiTable.vue'
import type { UiTableColumn } from '@/components/ui/UiTable.vue'

const props = defineProps<{
  modelValue: boolean
  title: string
  rows: PerformanceFocusGroupChangePerson[]
  loading: boolean
  error: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const columns: UiTableColumn[] = [
  { key: 'display_name', label: '姓名' },
  { key: 'direct_supervisor_name', label: '直属上级' },
  { key: 'department_2', label: '一级部门' },
  { key: 'department_5', label: '末级部门' },
  { key: 'job_family', label: '序列' },
]
</script>

<template>
  <PerformanceDialogShell :model-value="props.modelValue" :title="props.title" width="var(--performance-dialog-wide-width)" @update:model-value="emit('update:modelValue', $event)" @close="emit('update:modelValue', false)">
    <p v-if="props.error" class="focus-group-people-dialog__error" role="alert">{{ props.error }}</p>
    <div class="focus-group-people-dialog__table">
      <UiTable :columns="columns" :rows="props.rows" :loading="props.loading" loading-text="正在加载人员…" empty-text="暂无人员" row-key="employee_no" aria-label="人员列表">
        <template #cell="{ value }"><span>{{ value ?? '--' }}</span></template>
      </UiTable>
    </div>
  </PerformanceDialogShell>
</template>

<style scoped>
.focus-group-people-dialog__error { margin: 0 0 var(--spacing-3); color: var(--performance-field-error-color); font-size: var(--font-size-md); line-height: 22px; }
.focus-group-people-dialog__table { min-width: 0; min-height: 0; overflow: auto; }
</style>
